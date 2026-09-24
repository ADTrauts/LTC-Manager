/**
 * Shared row → Review fact mappers. Used by day and range loaders.
 */

import type { LogAttachmentForResolve } from "@/lib/canonical-logs/resolve-log-requirements";

import { toServiceDateKey } from "@/lib/operational-time";

import type {
  ReviewAssignmentFact,
  ReviewAttachmentSegmentFact,
  ReviewCoverageTemplateFact,
  ReviewEvidenceRecordFact,
  ReviewServeryMilestoneActual,
} from "./types";

export const REVIEW_ATTACHMENT_INCLUDE = {
  dailyWindows: { orderBy: { displaySequence: "asc" as const } },
  cycleSelections: { orderBy: { displaySequence: "asc" as const } },
  catalogDefinition: {
    include: { fields: { orderBy: { displaySequence: "asc" as const } } },
  },
} as const;

function asCatalogPurpose(
  purposeType: string,
): LogAttachmentForResolve["catalogDefinition"]["purposeType"] {
  if (purposeType === "CHECKLIST") {
    return purposeType;
  }
  return "LOG";
}

export function mapReviewAttachmentSegments(
  attachments: Array<{
    id: string;
    stableKey: string;
    facilityId: string;
    departmentId: string;
    catalogStableKey: string;
    catalogVersion: number;
    status: ReviewAttachmentSegmentFact["status"];
    effectiveFrom: Date;
    effectiveTo: Date | null;
    timingMode: ReviewAttachmentSegmentFact["timingMode"];
    allowAdHoc: boolean;
    calendarCadence: ReviewAttachmentSegmentFact["calendarCadence"];
    calendarDaysOfWeek: number[];
    calendarDayOfMonth: number | null;
    calendarDueTimeLocal: string | null;
    localDisplayLabel: string | null;
    localInstructions: string | null;
    targetKind: ReviewAttachmentSegmentFact["targetKind"];
    assetId: string | null;
    spaceId: string | null;
    unitId: string | null;
    targetDepartmentId: string | null;
    operationalTypeKey: string | null;
    updatedAt: Date;
    createdAt: Date;
    dailyWindows: ReviewAttachmentSegmentFact["dailyWindows"];
    cycleSelections: ReviewAttachmentSegmentFact["cycleSelections"];
    catalogDefinition: {
      id: string;
      name: string;
      purposeType: string;
      instructions: string | null;
      status: ReviewAttachmentSegmentFact["catalogDefinition"]["status"];
      fields: ReviewAttachmentSegmentFact["catalogDefinition"]["fields"];
    };
  }>,
): ReviewAttachmentSegmentFact[] {
  return attachments.map((row) => ({
    id: row.id,
    stableKey: row.stableKey,
    facilityId: row.facilityId,
    departmentId: row.departmentId,
    catalogStableKey: row.catalogStableKey,
    catalogVersion: row.catalogVersion,
    status: row.status,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    timingMode: row.timingMode,
    allowAdHoc: row.allowAdHoc,
    calendarCadence: row.calendarCadence,
    calendarDaysOfWeek: row.calendarDaysOfWeek,
    calendarDayOfMonth: row.calendarDayOfMonth,
    calendarDueTimeLocal: row.calendarDueTimeLocal,
    localDisplayLabel: row.localDisplayLabel,
    localInstructions: row.localInstructions,
    targetKind: row.targetKind,
    assetId: row.assetId,
    spaceId: row.spaceId,
    unitId: row.unitId,
    targetDepartmentId: row.targetDepartmentId,
    operationalTypeKey: row.operationalTypeKey,
    dailyWindows: row.dailyWindows,
    cycleSelections: row.cycleSelections,
    catalogDefinition: {
      id: row.catalogDefinition.id,
      name: row.catalogDefinition.name,
      purposeType: asCatalogPurpose(row.catalogDefinition.purposeType),
      instructions: row.catalogDefinition.instructions,
      status: row.catalogDefinition.status,
      fields: row.catalogDefinition.fields,
    },
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  }));
}

export function mapReviewEvidenceRecords(
  evidence: Array<{
    id: string;
    requirementKey: string;
    logRequirementKey: string | null;
    status: ReviewEvidenceRecordFact["status"];
    operationalDate: Date;
    templateVersion: number;
    outOfStandard: boolean;
    logAttachmentId: string | null;
    attachmentStableKey: string | null;
    catalogDefinition: { stableKey: string } | null;
    spaceId: string | null;
    unitId: string | null;
    occurredAt: Date;
    recordedAt: Date;
    values: Array<{ valueNumber: number | null; fieldKey: string }>;
  }>,
): ReviewEvidenceRecordFact[] {
  return evidence.map((row) => {
    const numeric = row.values.find((value) => value.valueNumber != null);
    return {
      id: row.id,
      requirementKey: row.requirementKey,
      logRequirementKey: row.logRequirementKey,
      status: row.status,
      operationalDateKey: toServiceDateKey(row.operationalDate),
      catalogVersion: row.templateVersion,
      valueNumber: numeric?.valueNumber ?? null,
      unitLabel: null,
      outOfStandard: row.outOfStandard,
      logAttachmentId: row.logAttachmentId,
      attachmentStableKey: row.attachmentStableKey,
      catalogStableKey: row.catalogDefinition?.stableKey ?? null,
      spaceId: row.spaceId,
      unitId: row.unitId,
      occurredAt: row.occurredAt,
      recordedAt: row.recordedAt,
    };
  });
}

export function detectLocationChangedAssignmentIds(
  events: Array<{ assignmentId: string | null; priorValuesJson: string | null; newValuesJson: string | null }>,
): Set<string> {
  return new Set(
    events
      .filter((row) => {
        const prior = row.priorValuesJson ?? "";
        const next = row.newValuesJson ?? "";
        return /unitSpaceId|locations|spaceId/i.test(`${prior}${next}`);
      })
      .map((row) => row.assignmentId)
      .filter((id): id is string => Boolean(id)),
  );
}

export function mapReviewAssignments(
  assignments: Array<{
    id: string;
    departmentId: string;
    roleKey: string;
    status: string;
    unitId: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    employeeId: string | null;
    employee: { firstName: string; lastName: string };
    locations: Array<{ unitSpaceId: string }>;
  }>,
  changedAssignmentIds: Set<string>,
): ReviewAssignmentFact[] {
  return assignments.map((row) => ({
    id: row.id,
    departmentId: row.departmentId,
    roleKey: row.roleKey,
    status: row.status,
    unitId: row.unitId,
    coveredSpaceIds: row.locations.map((loc) => loc.unitSpaceId),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    hasCallDown: false,
    employeeId: row.employeeId,
    employeeDisplayName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
    locationChangedDuringEdits: changedAssignmentIds.has(row.id),
  }));
}

export function mapReviewCoverageTemplates(
  templates: Array<{
    id: string;
    stableKey: string;
    version: number;
    status: ReviewCoverageTemplateFact["status"];
    isActive: boolean;
    effectiveFrom: Date | string | null;
    effectiveTo: Date | string | null;
    items: ReviewCoverageTemplateFact["items"];
  }>,
): ReviewCoverageTemplateFact[] {
  return templates.map((row) => ({
    id: row.id,
    stableKey: row.stableKey,
    version: row.version,
    status: row.status,
    isActive: row.isActive,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    items: row.items,
  }));
}

export function mapReviewServeryEvents(
  events: Array<{
    unitId: string;
    mealType: string;
    mealServiceReadyAt: Date | null;
    readyRecordedAt: Date | null;
    mealServiceStartedAt: Date | null;
    startedRecordedAt: Date | null;
    entries: Array<{
      milestone: string;
      occurredAt: Date;
      recordedAt: Date | null;
    }>;
  }>,
): ReviewServeryMilestoneActual[] {
  return events.flatMap((event) => {
    const latestReady =
      event.entries.find((entry) => entry.milestone === "READY") ??
      (event.mealServiceReadyAt
        ? {
            milestone: "READY" as const,
            occurredAt: event.mealServiceReadyAt,
            recordedAt: event.readyRecordedAt,
          }
        : null);
    const latestStarted =
      event.entries.find((entry) => entry.milestone === "SERVICE_STARTED") ??
      (event.mealServiceStartedAt
        ? {
            milestone: "SERVICE_STARTED" as const,
            occurredAt: event.mealServiceStartedAt,
            recordedAt: event.startedRecordedAt,
          }
        : null);
    return [latestReady, latestStarted]
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => ({
        unitId: event.unitId,
        mealType: event.mealType,
        milestone: row.milestone as "READY" | "SERVICE_STARTED",
        occurredAt: row.occurredAt,
        recordedAt: row.recordedAt,
      }));
  });
}

export function employeeDisplayName(employee: { firstName: string; lastName: string }): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}
