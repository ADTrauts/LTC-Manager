/**
 * Batch loader for Record audit.
 * Segments, bindings, Records, waivers, and place names are loaded once for the range.
 * Slot composition happens in memory.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

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
    const value = row.values[0];
    return {
      id: row.id,
      requirementKey: row.requirementKey,
      logRequirementKey: row.logRequirementKey,
      followsRecordId: row.followsRecordId,
      operationalDateKey: toServiceDateKey(row.operationalDate),
      spaceId: row.spaceId,
      templateVersion: row.templateVersion,
      outOfStandard: row.outOfStandard,
      valueNumber: value?.valueNumber ?? null,
      valueText: value?.valueText ?? null,
      correctiveActionText: row.correctiveActionText,
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
  const field = first as { valueNumber?: unknown; valueText?: unknown };
  if (typeof field.valueNumber === "number") return String(field.valueNumber);
  if (typeof field.valueText === "string") return field.valueText;
  return null;
}
