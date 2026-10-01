/**
 * Canonical Record audit.
 * Each service date uses the requirement segment and Location Function binding
 * effective that day, then joins sparse Records, corrections, follow-ups, and waivers.
 * Expected slots are derived. Missing slots are not stored.
 */

import { bindOperationalTypeRequirementToSpace } from "@/lib/canonical-logs/log-operational-type-applicability";
import { presentRecordForm } from "@/lib/canonical-logs/record-engine";
import { attachmentLineageKey } from "@/lib/canonical-logs/attachment-update-policy";
import { selectSegmentForDate, type LogExpectationHistorySegment } from "@/lib/canonical-logs/expectation-history";
import {
  resolveLogRequirementsForAttachment,
  type PublishedCycleForLogs,
} from "@/lib/canonical-logs/resolve-log-requirements";
import { toHistorySlotState, type LogHistorySlotState } from "@/lib/logs-architecture/history-slot-state";
import { nextOperationalDayKey } from "@/lib/operational-cycles/cycle-lifecycle";
import {
  historicalOtAssignmentsFromBindings,
  selectHistoricalProfileForServiceDate,
} from "@/lib/operational-review/historical-operational-type";
import type { ReviewOtBindingFact, ReviewProfileFact } from "@/lib/operational-review/types";

import { resolvePlaceLabel, type PlaceNameChangeFact } from "./place-name";

export type AuditSlotState = LogHistorySlotState | "WAIVED";

export type AuditRecordFact = {
  id: string;
  requirementKey: string;
  logRequirementKey: string | null;
  followsRecordId: string | null;
  operationalDateKey: string;
  spaceId: string | null;
  templateVersion: number;
  outOfStandard: boolean;
  valueNumber: number | null;
  valueText: string | null;
  correctiveActionText: string | null;
  occurredAt: string | null;
  recordedAt: string | null;
  recordedByLabel: string | null;
  placeLabelSnapshot: string | null;
  status: string;
  corrections: Array<{
    previousValue: string | null;
    reason: string;
    actorLabel: string | null;
    recordedAt: string;
  }>;
};

export type AuditWaiverFact = {
  requirementKey: string;
  operationalDateKey: string;
  reason: string;
  actorLabel: string | null;
  recordedAt: string;
};

export type AuditSpaceFact = {
  spaceId: string;
  currentLabel: string;
};

export type AuditRecordSlot = {
  serviceDate: string;
  departmentId: string;
  catalogStableKey: string;
  catalogVersion: number;
  definitionLabel: string;
  recordForm: string;
  requirementSegmentId: string;
  attachmentStableKey: string;
  locationFunctionKey: string | null;
  spaceId: string | null;
  assetId: string | null;
  unitId: string | null;
  cycleStableKey: string | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  requirementKey: string;
  slotState: AuditSlotState;
  placeLabel: string | null;
  placeLabelCertainty: "SNAPSHOT" | "HISTORICAL" | "CURRENT_LABEL" | null;
  record: {
    id: string;
    occurredAt: string | null;
    recordedAt: string | null;
    recordedByLabel: string | null;
    valueNumber: number | null;
    valueText: string | null;
    outOfStandard: boolean;
    correctiveActionText: string | null;
    templateVersion: number;
    status: string;
  } | null;
  followUps: Array<{
    id: string;
    valueNumber: number | null;
    occurredAt: string | null;
    recordedAt: string | null;
    recordedByLabel: string | null;
    outOfStandard: boolean;
  }>;
  corrections: AuditRecordFact["corrections"];
  waiver: { reason: string; actorLabel: string | null; recordedAt: string } | null;
  waiverAllowed: boolean;
  source: "CANONICAL_RECORD";
};

export type AuditRecordResult = {
  fromDateKey: string;
  toDateKey: string;
  slots: AuditRecordSlot[];
  legacyDates: string[];
};

export type AuditOperationalRecordsInput = {
  fromDateKey: string;
  toDateKey: string;
  todayKey: string;
  now: Date;
  facilityTimezone: string;
  departmentId: string;
  catalogStableKey?: string | null;
  locationFunctionKey?: string | null;
  segments: readonly (LogExpectationHistorySegment & { waiverAllowed?: boolean })[];
  profiles: readonly ReviewProfileFact[];
  bindings: readonly ReviewOtBindingFact[];
  spaces: readonly AuditSpaceFact[];
  placeNames: readonly PlaceNameChangeFact[];
  records: readonly AuditRecordFact[];
  waivers: readonly AuditWaiverFact[];
  publishedCyclesByDate?: Readonly<Record<string, readonly PublishedCycleForLogs[]>>;
  /** Dates whose expectation came from legacy logs, not LogAttachment segments. */
  legacyLogDates?: readonly string[];
};

function dateKeys(fromKey: string, toKey: string): string[] {
  const keys: string[] = [];
  let current = fromKey;
  while (current <= toKey) {
    keys.push(current);
    current = nextOperationalDayKey(current);
  }
  return keys;
}

function lineageOf(segment: LogExpectationHistorySegment): string {
  return attachmentLineageKey({
    catalogStableKey: segment.catalogStableKey,
    targetKind: segment.targetKind,
    assetId: segment.assetId,
    spaceId: segment.spaceId,
    unitId: segment.unitId,
    targetDepartmentId: segment.targetDepartmentId,
    operationalTypeKey: segment.operationalTypeKey,
    departmentId: segment.departmentId,
  });
}

function recordMatchesSlot(record: AuditRecordFact, requirementKey: string): boolean {
  if (record.followsRecordId) return false;
  return record.requirementKey === requirementKey || record.logRequirementKey === requirementKey;
}

export function auditOperationalRecords(input: AuditOperationalRecordsInput): AuditRecordResult {
  const keys = dateKeys(input.fromDateKey, input.toDateKey);
  const segments = input.segments.filter((segment) => segment.departmentId === input.departmentId);
  const lineages = new Map<string, LogExpectationHistorySegment[]>();
  for (const segment of segments) {
    const key = lineageOf(segment);
    const list = lineages.get(key) ?? [];
    list.push(segment);
    lineages.set(key, list);
  }

  const spaceLabels = new Map(input.spaces.map((space) => [space.spaceId, space.currentLabel]));
  const waiverBySegment = new Map(segments.map((row) => [row.id, row.waiverAllowed === true]));
  const slots: AuditRecordSlot[] = [];
  const canonicalDates = new Set<string>();

  for (const serviceDate of keys) {
    for (const group of lineages.values()) {
      const segment = selectSegmentForDate(group, serviceDate);
      if (!segment) continue;
      if (input.catalogStableKey && segment.catalogStableKey !== input.catalogStableKey) continue;
      if (
        input.locationFunctionKey &&
        segment.operationalTypeKey !== input.locationFunctionKey
      ) {
        continue;
      }

      const targets = targetsForSegment(segment, serviceDate, input);
      if (targets.length === 0) continue;
      canonicalDates.add(serviceDate);

      for (const target of targets) {
        const attachment = {
          ...segment,
          resolvedSpaceId: target.spaceId,
        };
        const requirements = resolveLogRequirementsForAttachment({
          attachment,
          operationalDateKey: serviceDate,
          now: input.now,
          facilityTimezone: input.facilityTimezone,
          publishedCycles: input.publishedCyclesByDate?.[serviceDate] ?? [],
          existingRecords: [],
        }).filter(
          (requirement) =>
            requirement.productState !== "NEEDS_SETUP" && requirement.productState !== "NOT_APPLICABLE",
        );

        for (const requirement of requirements) {
          const bound = target.spaceId
            ? bindOperationalTypeRequirementToSpace(requirement, target.spaceId)
            : requirement;
          const requirementKey = bound.requirementKey;
          const record =
            input.records.find(
              (row) =>
                row.operationalDateKey === serviceDate && recordMatchesSlot(row, requirementKey),
            ) ?? null;
          const waiver =
            input.waivers.find(
              (row) => row.requirementKey === requirementKey && row.operationalDateKey === serviceDate,
            ) ?? null;
          const followUps = record
            ? input.records.filter((row) => row.followsRecordId === record.id)
            : [];
          const slotState = slotStateFor({
            liveState: bound.productState,
            serviceDate,
            todayKey: input.todayKey,
            record,
            waiver,
          });
          const currentLabel = target.spaceId ? spaceLabels.get(target.spaceId) ?? null : null;
          const place = currentLabel
            ? resolvePlaceLabel({
                serviceDateKey: serviceDate,
                currentLabel,
                history: input.placeNames.filter((row) => row.placeId === target.spaceId),
                recordSnapshot: record?.placeLabelSnapshot,
              })
            : null;

          slots.push({
            serviceDate,
            departmentId: segment.departmentId,
            catalogStableKey: segment.catalogStableKey,
            catalogVersion: segment.catalogVersion,
            definitionLabel: segment.localDisplayLabel?.trim() || segment.catalogDefinition.name,
            recordForm: auditRecordFormLabel(segment),
            requirementSegmentId: segment.id,
            attachmentStableKey: segment.stableKey,
            locationFunctionKey: segment.operationalTypeKey,
            spaceId: target.spaceId,
            assetId: segment.assetId,
            unitId: segment.unitId,
            cycleStableKey: bound.cycleStableKey,
            windowStartLocal: bound.windowStartLocal,
            windowEndLocal: bound.windowEndLocal,
            requirementKey,
            slotState,
            placeLabel: place?.label ?? null,
            placeLabelCertainty: place?.certainty ?? null,
            record: record
              ? {
                  id: record.id,
                  occurredAt: record.occurredAt,
                  recordedAt: record.recordedAt,
                  recordedByLabel: record.recordedByLabel,
                  valueNumber: record.valueNumber,
                  valueText: record.valueText,
                  outOfStandard: record.outOfStandard,
                  correctiveActionText: record.correctiveActionText,
                  templateVersion: record.templateVersion,
                  status: record.status,
                }
              : null,
            followUps: followUps.map((row) => ({
              id: row.id,
              valueNumber: row.valueNumber,
              occurredAt: row.occurredAt,
              recordedAt: row.recordedAt,
              recordedByLabel: row.recordedByLabel,
              outOfStandard: row.outOfStandard,
            })),
            corrections: record?.corrections ?? [],
            waiver: waiver
              ? {
                  reason: waiver.reason,
                  actorLabel: waiver.actorLabel,
                  recordedAt: waiver.recordedAt,
                }
              : null,
            waiverAllowed: waiverBySegment.get(segment.id) === true,
            source: "CANONICAL_RECORD",
          });
        }
      }
    }
  }

  slots.sort((a, b) => {
    if (a.serviceDate !== b.serviceDate) return a.serviceDate < b.serviceDate ? -1 : 1;
    const place = (a.placeLabel ?? "").localeCompare(b.placeLabel ?? "");
    if (place !== 0) return place;
    return (a.windowStartLocal ?? "").localeCompare(b.windowStartLocal ?? "");
  });

  const legacyDates = (input.legacyLogDates ?? []).filter(
    (date) => date >= input.fromDateKey && date <= input.toDateKey && !canonicalDates.has(date),
  );

  return { fromDateKey: input.fromDateKey, toDateKey: input.toDateKey, slots, legacyDates };
}

function targetsForSegment(
  segment: LogExpectationHistorySegment,
  serviceDate: string,
  input: AuditOperationalRecordsInput,
): Array<{ spaceId: string | null }> {
  if (segment.targetKind !== "OPERATIONAL_TYPE") {
    if (segment.targetKind === "SPACE") return [{ spaceId: segment.spaceId }];
    return [{ spaceId: null }];
  }
  const selected = selectHistoricalProfileForServiceDate(input.profiles, {
    departmentId: segment.departmentId,
    serviceDateKey: serviceDate,
    timezone: input.facilityTimezone,
  });
  if (selected.status !== "evaluated") return [];
  const assignments = historicalOtAssignmentsFromBindings(input.bindings, selected.profile.id);
  const wanted = segment.operationalTypeKey?.trim() || "";
  const spaceIds = [...assignments.entries()]
    .filter(([, assignment]) => assignment.key === wanted)
    .map(([spaceId]) => spaceId);
  return spaceIds.map((spaceId) => ({ spaceId }));
}

function slotStateFor(input: {
  liveState: string;
  serviceDate: string;
  todayKey: string;
  record: AuditRecordFact | null;
  waiver: AuditWaiverFact | null;
}): AuditSlotState {
  if (input.record) {
    return toHistorySlotState({
      liveState: input.liveState,
      operationalDateKey: input.serviceDate,
      todayKey: input.todayKey,
      hasSubmission: true,
      submissionHasCorrectiveAction: Boolean(input.record.correctiveActionText?.trim()),
    });
  }
  if (input.waiver) return "WAIVED";
  return toHistorySlotState({
    liveState: input.liveState,
    operationalDateKey: input.serviceDate,
    todayKey: input.todayKey,
    hasSubmission: false,
    submissionHasCorrectiveAction: false,
  });
}

function auditRecordFormLabel(segment: {
  timingMode: string;
  catalogDefinition: { purposeType: string; fields: Array<{ fieldType: string }> };
}): string {
  const purpose = segment.catalogDefinition.purposeType;
  if (purpose !== "LOG" && purpose !== "CHECKLIST" && purpose !== "INSPECTION" && purpose !== "PROCEDURE") {
    return "Record";
  }
  const timingMode =
    segment.timingMode === "AD_HOC" ||
    segment.timingMode === "DAILY_WINDOWS" ||
    segment.timingMode === "OPERATIONAL_CYCLE" ||
    segment.timingMode === "CALENDAR"
      ? segment.timingMode
      : null;
  const form = presentRecordForm({
    purposeType: purpose,
    timingMode,
    fieldTypes: segment.catalogDefinition.fields.map((field) => field.fieldType),
  });
  if (form === "INSPECTION") return "Inspection";
  if (form === "CHECKLIST") return "Checklist";
  if (form === "ACKNOWLEDGEMENT") return "Acknowledgement";
  if (form === "ON_DEMAND") return "On demand";
  if (form === "READING") return "Reading";
  return "Record";
}

export function auditRecordsToCsv(slots: readonly AuditRecordSlot[]): string {
  const header = [
    "serviceDate",
    "departmentId",
    "definition",
    "recordForm",
    "definitionVersion",
    "requirementSegmentId",
    "location",
    "locationFunction",
    "windowStart",
    "windowEnd",
    "cycleStableKey",
    "status",
    "value",
    "recordedAt",
    "actor",
    "outOfStandard",
    "correctiveAction",
    "followUp",
    "source",
  ];
  const lines = [header.join(",")];
  for (const slot of slots) {
    const followUp = slot.followUps
      .map((row) => row.valueNumber ?? "")
      .filter((value) => value !== "")
      .join("|");
    lines.push(
      [
        slot.serviceDate,
        slot.departmentId,
        csv(slot.definitionLabel),
        slot.recordForm,
        String(slot.catalogVersion),
        slot.requirementSegmentId,
        csv(slot.placeLabel ?? ""),
        slot.locationFunctionKey ?? "",
        slot.windowStartLocal ?? "",
        slot.windowEndLocal ?? "",
        slot.cycleStableKey ?? "",
        slot.slotState,
        slot.record?.valueNumber ?? slot.record?.valueText ?? "",
        slot.record?.recordedAt ?? "",
        csv(slot.record?.recordedByLabel ?? slot.waiver?.actorLabel ?? ""),
        slot.record ? String(slot.record.outOfStandard) : "",
        csv(slot.record?.correctiveActionText ?? ""),
        followUp,
        slot.source,
      ].join(","),
    );
  }
  return lines.join("\n");
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
