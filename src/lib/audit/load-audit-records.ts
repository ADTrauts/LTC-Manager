/**
 * Batch loader for Record audit.
 * Segments, bindings, Records, waivers, and place names are loaded once for the range.
 * Slot composition happens in memory.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { serializeEvidenceFieldForCsv, formatEvidenceFieldDisplay } from "@/lib/canonical-logs/evidence-field-display";
import { scoreInspectionSnapshotJson } from "@/lib/canonical-logs/inspection-score";
import { parseLogSubmissionSnapshot } from "@/lib/canonical-logs/snapshot";
import { parseRepeatingGroups, evaluateCalculations, parseCalculations, type RepeatRowInput } from "@/lib/canonical-logs/template-structure";
import { mapReviewAttachmentSegments } from "@/lib/operational-review/review-fact-maps";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  resolveFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

import { auditOperationalRecords, type AuditRecordFact, type AuditRecordResult } from "./audit-records";
import type { PlaceNameChangeFact } from "./place-name";

type Db = PrismaClient | Prisma.TransactionClient;

export async function loadAuditOperationalRecords(
  client: Db,
  input: {
    facilityId: string;
    departmentId: string;
    fromDateKey: string;
    toDateKey: string;
    catalogStableKey?: string | null;
    locationFunctionKey?: string | null;
    now?: Date;
  },
): Promise<AuditRecordResult> {
  const now = input.now ?? new Date();
  const timezone = resolveFacilityTimezone(
    await loadFacilityTimezone(client as PrismaClient, input.facilityId),
  );
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const startDate = facilityLocalDateToServiceDate(input.fromDateKey);
  const endExclusive = facilityLocalDateToServiceDate(shiftDate(input.toDateKey, 1));

  const [profiles, attachments, records, waivers, placeNames, spaces] = await Promise.all([
    client.departmentOperationalProfile.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        status: { in: ["ACTIVE", "RETIRED", "CERTIFIED"] },
      },
      select: {
        id: true,
        departmentId: true,
        version: true,
        status: true,
        activatedAt: true,
        retiredAt: true,
      },
    }),
    client.logAttachment.findMany({
      where: { facilityId: input.facilityId, departmentId: input.departmentId },
      include: {
        dailyWindows: { orderBy: { displaySequence: "asc" } },
        cycleSelections: { orderBy: { displaySequence: "asc" } },
        catalogDefinition: { include: { fields: { orderBy: { displaySequence: "asc" } } } },
      },
    }),
    client.operationalEvidenceRecord.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        operationalDate: { gte: startDate, lt: endExclusive },
      },
      include: {
        values: true,
        corrections: { orderBy: { createdAt: "asc" } },
      },
    }),
    client.operationalRecordWaiver.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.departmentId,
        operationalDate: { gte: startDate, lt: endExclusive },
      },
    }),
    client.placeNameChange.findMany({
      where: { facilityId: input.facilityId },
    }),
    client.unitSpace.findMany({
      where: { facilityId: input.facilityId },
      select: { id: true, name: true },
    }),
  ]);

  const profileIds = profiles.map((row) => row.id);
  const bindings =
    profileIds.length === 0
      ? []
      : await client.departmentRoomArchetypeBinding.findMany({
          where: { profileId: { in: profileIds } },
          select: {
            profileId: true,
            unitSpaceId: true,
            archetype: { select: { key: true, name: true, isActive: true } },
          },
        });

  const placeFacts: PlaceNameChangeFact[] = placeNames.map((row) => ({
    placeId: row.unitSpaceId ?? row.unitId ?? "",
    placeKind: row.placeKind === "UNIT" ? "UNIT" : "SPACE",
    previousLabel: row.previousLabel,
    newLabel: row.newLabel,
    effectiveFromKey: toServiceDateKey(row.effectiveFrom),
  }));

  const recordFacts: AuditRecordFact[] = records.map((row) => {
    const scalar = row.values.find((value) => !value.groupKey);
    const csvValue = scalar
      ? serializeEvidenceFieldForCsv({
          fieldType: scalar.fieldType,
          valueText: scalar.valueText,
          valueNumber: scalar.valueNumber,
          valueBoolean: scalar.valueBoolean,
          valueSelections: scalar.valueSelections,
        })
      : "";
    return {
      id: row.id,
      requirementKey: row.requirementKey,
      logRequirementKey: row.logRequirementKey,
      followsRecordId: row.followsRecordId,
      operationalDateKey: toServiceDateKey(row.operationalDate),
      spaceId: row.spaceId,
      templateVersion: row.templateVersion,
      outOfStandard: row.outOfStandard,
      valueNumber: scalar?.valueNumber ?? null,
      valueText: scalar?.valueText ?? (csvValue || null),
      correctiveActionText: row.correctiveActionText,
      inspection: inspectionExport(row.templateSnapshotJson, row.values),
      repeatResponses: projectRepeatResponses(row.templateSnapshotJson, row.values),
      occurredAt: row.occurredAt?.toISOString() ?? null,
      recordedAt: row.recordedAt?.toISOString() ?? null,
      recordedByLabel: row.recordedByLabel,
      placeLabelSnapshot: row.placeLabelSnapshot,
      status: row.status,
      corrections: row.corrections.map((correction) => ({
        previousValue: previousValueLabel(correction.previousValuesJson),
        reason: correction.reason,
        actorLabel: correction.correctedByLabel,
        recordedAt: correction.createdAt.toISOString(),
      })),
    };
  });

  return auditOperationalRecords({
    fromDateKey: input.fromDateKey,
    toDateKey: input.toDateKey,
    todayKey,
    now,
    facilityTimezone: timezone,
    departmentId: input.departmentId,
    catalogStableKey: input.catalogStableKey,
    locationFunctionKey: input.locationFunctionKey,
    segments: mapReviewAttachmentSegments(attachments).map((segment) => ({
      ...segment,
      waiverAllowed: attachments.find((row) => row.id === segment.id)?.waiverAllowed ?? false,
    })),
    profiles,
    bindings: bindings.map((row) => ({
      profileId: row.profileId,
      spaceId: row.unitSpaceId,
      operationalTypeKey: row.archetype.key,
      operationalTypeName: row.archetype.name,
      archetypeIsActive: row.archetype.isActive,
    })),
    spaces: spaces.map((space) => ({ spaceId: space.id, currentLabel: space.name })),
    placeNames: placeFacts,
    records: recordFacts,
    waivers: waivers.map((row) => ({
      requirementKey: row.requirementKey,
      operationalDateKey: toServiceDateKey(row.operationalDate),
      reason: row.reason,
      actorLabel: row.recordedByLabel,
      recordedAt: row.recordedAt.toISOString(),
    })),
  });
}

function projectRepeatResponses(
  templateSnapshotJson: unknown,
  values: Array<{
    fieldKey: string;
    label: string;
    valueText: string | null;
    valueNumber: number | null;
    valueBoolean: boolean | null;
    groupKey?: string | null;
    rowKey?: string | null;
    rowSequence?: number | null;
    outOfStandard: boolean;
  }>,
): NonNullable<AuditRecordFact["repeatResponses"]> {
  const snapshot = parseLogSubmissionSnapshot(templateSnapshotJson);
  const groups = parseRepeatingGroups(snapshot?.catalog.repeatingGroups ?? []);
  const groupLabel = new Map(groups.map((group) => [group.groupKey, group.label]));
  const columns = new Map(
    groups.flatMap((group) =>
      group.columns.map((column) => [`${group.groupKey}:${column.columnKey}`, column] as const),
    ),
  );
  const cells = values
    .filter((value) => value.groupKey)
    .slice()
    .sort((a, b) => (a.rowSequence ?? 0) - (b.rowSequence ?? 0) || a.fieldKey.localeCompare(b.fieldKey))
    .map((value) => {
      const column = columns.get(`${value.groupKey}:${value.fieldKey}`);
      const display =
        value.valueNumber != null
          ? String(value.valueNumber)
          : value.valueBoolean == null
            ? (value.valueText ?? "")
            : value.valueBoolean
              ? "Yes"
              : "No";
      return {
        group: groupLabel.get(value.groupKey ?? "") ?? value.groupKey ?? "",
        row: value.rowKey ?? "",
        column: column?.label ?? value.label,
        value: display,
        unit: column?.unitLabel ?? "",
        outOfStandard: value.outOfStandard,
      };
    });
  const grouped = new Map<string, RepeatRowInput>();
  for (const value of values) {
    if (!value.groupKey || !value.rowKey) continue;
    const key = `${value.groupKey}:${value.rowKey}`;
    const row = grouped.get(key) ?? {
      groupKey: value.groupKey,
      rowKey: value.rowKey,
      rowSequence: value.rowSequence ?? 0,
      cells: [],
    };
    row.cells.push({
      columnKey: value.fieldKey,
      valueText: value.valueText,
      valueNumber: value.valueNumber,
      valueBoolean: value.valueBoolean,
    });
    grouped.set(key, row);
  }
  const calculated = evaluateCalculations({
    calculations: parseCalculations(snapshot?.catalog.calculations ?? []),
    rows: [...grouped.values()],
  }).map((result) => ({
    group: "Calculated",
    row: "",
    column: result.label,
    value: result.value == null ? "" : String(result.value),
    unit: result.unitLabel ?? "",
    outOfStandard: false,
  }));
  return [...cells, ...calculated];
}

function inspectionExport(
  templateSnapshotJson: unknown,
  values: Array<{
    fieldKey: string;
    fieldType: string;
    valueText: string | null;
    valueNumber: number | null;
    valueBoolean: boolean | null;
    valueSelections: string[];
    outOfStandard: boolean;
    label: string;
    unitLabel?: string | null;
    groupKey?: string | null;
  }>,
): AuditRecordFact["inspection"] {
  const scalarValues = values.filter((value) => !value.groupKey);
  const score = scoreInspectionSnapshotJson({ templateSnapshotJson, values: scalarValues });
  if (!score) return null;
  const snapshot = parseLogSubmissionSnapshot(templateSnapshotJson);
  const byKey = new Map(scalarValues.map((value) => [value.fieldKey, value]));
  const questions = (snapshot?.catalog.fields ?? []).map((field) => {
    const value = byKey.get(field.fieldKey);
    const response = value
      ? formatEvidenceFieldDisplay({
          fieldType: value.fieldType,
          valueText: value.valueText,
          valueNumber: value.valueNumber,
          valueBoolean: value.valueBoolean,
          valueSelections: value.valueSelections,
          unitLabel: field.unitLabel,
        })
      : "";
    const weight = "scoreWeight" in field && typeof field.scoreWeight === "number" ? field.scoreWeight : null;
    const excluded = value?.valueText === "NOT_APPLICABLE";
    const missedCredit = score.exceptions.some((row) => row.fieldKey === field.fieldKey);
    return {
      field: field.label,
      response,
      notApplicable: excluded,
      outOfStandard: value?.outOfStandard === true,
      section: "sectionKey" in field ? field.sectionKey ?? null : null,
      scoreWeight: weight,
      earned: weight != null && !excluded && value ? (missedCredit ? 0 : weight) : null,
      critical: "critical" in field ? field.critical === true : false,
    };
  });
  return {
    percentage: score.percentage,
    outcome: score.outcome,
    criticalFailureCount: score.criticalFailures.length,
    questions,
    sectionScores: score.sectionScores,
  };
}

function shiftDate(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + days));
  return toServiceDateKey(date);
}

function previousValueLabel(value: Prisma.JsonValue): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as { values?: unknown };
  const first = Array.isArray(record.values) ? record.values[0] : null;
  if (!first || typeof first !== "object") return null;
  const field = first as {
    fieldType?: string;
    valueNumber?: unknown;
    valueText?: unknown;
    valueBoolean?: unknown;
    valueSelections?: unknown;
  };
  if (typeof field.valueNumber === "number") return String(field.valueNumber);
  if (typeof field.valueText === "string" && field.valueText.trim()) return field.valueText;
  if (typeof field.valueBoolean === "boolean") return field.valueBoolean ? "Yes" : "No";
  if (Array.isArray(field.valueSelections) && field.valueSelections.length > 0) {
    return field.valueSelections.filter((item): item is string => typeof item === "string").join(", ");
  }
  return null;
}
