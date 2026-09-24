/**
 * Attachment-backed LogRequirement derivation (Phase 3).
 */

import type {
  LogAttachmentTimingMode,
  OperationalEvidenceRecordStatus,
  OperationalTemplateScheduleKind,
} from "@prisma/client";

import { buildLogRequirementKey } from "@/lib/logs-architecture/requirement-key";
import {
  deriveWindowProductState,
  mapEvidenceStateToProductState,
  productStateLabel,
} from "@/lib/logs-architecture/due-state";
import type {
  LogAttachmentTarget,
  LogRequirement,
  LogRequirementProductState,
  CatalogLogFieldDefinition,
  CatalogLogPurposeType,
} from "@/lib/logs-architecture/types";
import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";
import { toServiceDateKey } from "@/lib/operational-time";

import { mapTimingModeToScheduleKind } from "./schedule-kind";

export type PublishedCycleForLogs = {
  stableKey: string;
  label: string;
  startLocal: string;
  endLocal: string;
  overnight: boolean;
  startsAt: Date;
  endsAt: Date;
};

export type ExistingLogEvidenceForResolve = {
  id: string;
  requirementKey: string;
  logRequirementKey: string | null;
  status: OperationalEvidenceRecordStatus;
};

export type LogAttachmentForResolve = {
  id: string;
  stableKey: string;
  facilityId: string;
  departmentId: string;
  catalogStableKey: string;
  catalogVersion: number;
  status: "ACTIVE" | "INACTIVE" | "RETIRED";
  effectiveFrom: Date;
  effectiveTo: Date | null;
  timingMode: LogAttachmentTimingMode;
  allowAdHoc: boolean;
  calendarCadence: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  calendarDaysOfWeek: number[];
  calendarDayOfMonth: number | null;
  calendarDueTimeLocal: string | null;
  localDisplayLabel: string | null;
  localInstructions: string | null;
  targetKind: "ASSET" | "SPACE" | "UNIT" | "DEPARTMENT" | "FACILITY" | "OPERATIONAL_TYPE";
  assetId: string | null;
  spaceId: string | null;
  unitId: string | null;
  targetDepartmentId: string | null;
  operationalTypeKey: string | null;
  /** Runtime expansion only — never persisted on the Attachment row. */
  resolvedSpaceId?: string | null;
  dailyWindows: Array<{
    label: string;
    startLocal: string;
    endLocal: string;
    displaySequence: number;
  }>;
  cycleSelections: Array<{ cycleStableKey: string; displaySequence: number }>;
  catalogDefinition: {
    id: string;
    name: string;
    purposeType: CatalogLogPurposeType;
    instructions: string | null;
    status: "DRAFT" | "PUBLISHED" | "RETIRED";
    fields: CatalogLogFieldDefinition[];
  };
};

function targetFromAttachment(row: LogAttachmentForResolve): LogAttachmentTarget {
  switch (row.targetKind) {
    case "ASSET":
      return { kind: "ASSET", assetId: row.assetId! };
    case "SPACE":
      return { kind: "SPACE", spaceId: row.spaceId! };
    case "UNIT":
      return { kind: "UNIT", unitId: row.unitId! };
    case "DEPARTMENT":
      return { kind: "DEPARTMENT", departmentId: row.targetDepartmentId! };
    case "FACILITY":
      return { kind: "FACILITY" };
    case "OPERATIONAL_TYPE":
      return {
        kind: "OPERATIONAL_TYPE",
        operationalTypeKey: row.operationalTypeKey!,
        resolvedSpaceId: row.resolvedSpaceId ?? null,
      };
  }
}

function serviceDateInRange(serviceDate: Date, from: Date, to: Date | null): boolean {
  const key = toServiceDateKey(serviceDate);
  if (key < toServiceDateKey(from)) return false;
  if (to && key > toServiceDateKey(to)) return false;
  return true;
}

function calendarMatches(input: {
  serviceDate: Date;
  cadence: "DAILY" | "WEEKLY" | "MONTHLY";
  daysOfWeek: number[];
  dayOfMonth: number | null;
}): boolean {
  if (input.cadence === "DAILY") return true;
  if (input.cadence === "WEEKLY") {
    return input.daysOfWeek.includes(input.serviceDate.getUTCDay());
  }
  const dim = new Date(
    Date.UTC(input.serviceDate.getUTCFullYear(), input.serviceDate.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const target = Math.min(input.dayOfMonth ?? 0, dim);
  return input.serviceDate.getUTCDate() === target;
}

function matchRecord(
  records: readonly ExistingLogEvidenceForResolve[],
  requirementKey: string,
): ExistingLogEvidenceForResolve | null {
  return (
    records.find((r) => r.logRequirementKey === requirementKey || r.requirementKey === requirementKey) ??
    null
  );
}

function applyRecordState(
  base: Omit<LogRequirement, "productState" | "productStateLabel" | "needsSupervisorReview" | "recordId" | "recordStatus">,
  record: ExistingLogEvidenceForResolve | null,
  temporal: LogRequirementProductState,
): LogRequirement {
  if (record) {
    const mapped = mapEvidenceStateToProductState(
      record.status === "COMPLETED_WITH_CORRECTIVE_ACTION"
        ? "COMPLETED_WITH_CORRECTIVE_ACTION"
        : record.status === "NEEDS_REVIEW"
          ? "NEEDS_REVIEW"
          : "COMPLETED",
    );
    return {
      ...base,
      productState: mapped.productState,
      productStateLabel: productStateLabel(mapped.productState),
      needsSupervisorReview: mapped.needsSupervisorReview,
      recordId: record.id,
      recordStatus: record.status,
    };
  }

  return {
    ...base,
    productState: temporal,
    productStateLabel: productStateLabel(temporal),
    needsSupervisorReview: false,
    recordId: null,
    recordStatus: null,
  };
}

export function resolveLogRequirementsForAttachment(input: {
  attachment: LogAttachmentForResolve;
  operationalDateKey: string;
  now: Date;
  facilityTimezone?: string | null;
  publishedCycles: readonly PublishedCycleForLogs[];
  existingRecords: readonly ExistingLogEvidenceForResolve[];
}): LogRequirement[] {
  const { attachment: row, operationalDateKey, now } = input;
  const serviceDate = new Date(`${operationalDateKey}T00:00:00.000Z`);
  const target = targetFromAttachment(row);
  const fields = row.catalogDefinition.fields;
  const instructions = row.localInstructions?.trim() || row.catalogDefinition.instructions;

  const needsSetupBase = {
    attachmentId: row.id,
    attachmentStableKey: row.stableKey,
    catalogStableKey: row.catalogStableKey,
    catalogVersion: row.catalogVersion,
    catalogName: row.localDisplayLabel?.trim() || row.catalogDefinition.name,
    purposeType: row.catalogDefinition.purposeType,
    facilityId: row.facilityId,
    departmentId: row.departmentId,
    operationalDateKey,
    timingSource:
      row.timingMode === "DAILY_WINDOWS"
        ? ("DAILY_WINDOWS" as const)
        : row.timingMode === "OPERATIONAL_CYCLE"
          ? ("OPERATIONAL_CYCLE" as const)
          : row.timingMode === "CALENDAR"
            ? ("CALENDAR" as const)
            : ("AD_HOC" as const),
    target,
    fields,
    instructions,
  };

  // Effective range is the live/historical authority. Closed/retired segments still
  // resolve on dates they cover so successor + retirement do not erase today or history.
  if (!serviceDateInRange(serviceDate, row.effectiveFrom, row.effectiveTo)) return [];
  if (row.catalogDefinition.status !== "PUBLISHED") {
    const key = buildLogRequirementKey({
      attachmentStableKey: row.stableKey,
      catalogStableKey: row.catalogStableKey,
      scheduleKind: "AD_HOC",
      target,
      operationalDateKey,
    });
    return [
      {
        ...needsSetupBase,
        requirementKey: key,
        scheduleKind: "AD_HOC",
        cycleStableKey: null,
        cycleLabel: null,
        windowStartLocal: null,
        windowEndLocal: null,
        windowStartsAt: null,
        windowEndsAt: null,
        productState: "NEEDS_SETUP",
        productStateLabel: productStateLabel("NEEDS_SETUP"),
        needsSupervisorReview: false,
        recordId: null,
        recordStatus: null,
      },
    ];
  }

  // Ad hoc: no scheduled requirements.
  if (row.timingMode === "AD_HOC") return [];

  const scheduleKind = mapTimingModeToScheduleKind(row.timingMode);
  const out: LogRequirement[] = [];

  if (row.timingMode === "OPERATIONAL_CYCLE") {
    if (row.cycleSelections.length === 0) {
      const key = buildLogRequirementKey({
        attachmentStableKey: row.stableKey,
        catalogStableKey: row.catalogStableKey,
        scheduleKind,
        target,
        operationalDateKey,
      });
      out.push({
        ...needsSetupBase,
        requirementKey: key,
        scheduleKind,
        cycleStableKey: null,
        cycleLabel: null,
        windowStartLocal: null,
        windowEndLocal: null,
        windowStartsAt: null,
        windowEndsAt: null,
        productState: "NEEDS_SETUP",
        productStateLabel: productStateLabel("NEEDS_SETUP"),
        needsSupervisorReview: false,
        recordId: null,
        recordStatus: null,
      });
      return out;
    }

    const published = new Map(input.publishedCycles.map((c) => [c.stableKey, c]));
    for (const sel of row.cycleSelections) {
      const cycle = published.get(sel.cycleStableKey);
      if (!cycle) {
        const key = buildLogRequirementKey({
          attachmentStableKey: row.stableKey,
          catalogStableKey: row.catalogStableKey,
          scheduleKind,
          cycleStableKey: sel.cycleStableKey,
          target,
          operationalDateKey,
        });
        out.push({
          ...needsSetupBase,
          requirementKey: key,
          scheduleKind,
          cycleStableKey: sel.cycleStableKey,
          cycleLabel: null,
          windowStartLocal: null,
          windowEndLocal: null,
          windowStartsAt: null,
          windowEndsAt: null,
          productState: "NEEDS_SETUP",
          productStateLabel: productStateLabel("NEEDS_SETUP"),
          needsSupervisorReview: false,
          recordId: null,
          recordStatus: null,
        });
        continue;
      }

      const requirementKey = buildLogRequirementKey({
        attachmentStableKey: row.stableKey,
        catalogStableKey: row.catalogStableKey,
        scheduleKind,
        cycleStableKey: cycle.stableKey,
        windowStartLocal: cycle.startLocal,
        windowEndLocal: cycle.endLocal,
        target,
        operationalDateKey,
      });
      const temporal = deriveWindowProductState({
        now,
        windowStartsAt: cycle.startsAt,
        windowEndsAt: cycle.endsAt,
        isAdHoc: false,
      });
      out.push(
        applyRecordState(
          {
            ...needsSetupBase,
            requirementKey,
            scheduleKind,
            cycleStableKey: cycle.stableKey,
            cycleLabel: cycle.label,
            windowStartLocal: cycle.startLocal,
            windowEndLocal: cycle.endLocal,
            windowStartsAt: cycle.startsAt,
            windowEndsAt: cycle.endsAt,
          },
          matchRecord(input.existingRecords, requirementKey),
          temporal,
        ),
      );
    }
    return out;
  }

  if (row.timingMode === "DAILY_WINDOWS") {
    if (row.dailyWindows.length === 0) {
      const key = buildLogRequirementKey({
        attachmentStableKey: row.stableKey,
        catalogStableKey: row.catalogStableKey,
        scheduleKind,
        target,
        operationalDateKey,
      });
      out.push({
        ...needsSetupBase,
        requirementKey: key,
        scheduleKind,
        cycleStableKey: null,
        cycleLabel: null,
        windowStartLocal: null,
        windowEndLocal: null,
        windowStartsAt: null,
        windowEndsAt: null,
        productState: "NEEDS_SETUP",
        productStateLabel: productStateLabel("NEEDS_SETUP"),
        needsSupervisorReview: false,
        recordId: null,
        recordStatus: null,
      });
      return out;
    }

    for (const window of row.dailyWindows) {
      const instants = resolveCycleWindowInstants({
        operationalDateKey,
        startLocal: window.startLocal,
        endLocal: window.endLocal,
        overnight: false,
        facilityTimezone: input.facilityTimezone,
      });
      const requirementKey = buildLogRequirementKey({
        attachmentStableKey: row.stableKey,
        catalogStableKey: row.catalogStableKey,
        scheduleKind,
        windowStartLocal: window.startLocal,
        windowEndLocal: window.endLocal,
        target,
        operationalDateKey,
      });
      const temporal = deriveWindowProductState({
        now,
        windowStartsAt: instants?.startsAt ?? null,
        windowEndsAt: instants?.endsAt ?? null,
        isAdHoc: false,
      });
      out.push(
        applyRecordState(
          {
            ...needsSetupBase,
            requirementKey,
            scheduleKind,
            cycleStableKey: null,
            cycleLabel: window.label,
            windowStartLocal: window.startLocal,
            windowEndLocal: window.endLocal,
            windowStartsAt: instants?.startsAt ?? null,
            windowEndsAt: instants?.endsAt ?? null,
          },
          matchRecord(input.existingRecords, requirementKey),
          temporal === "NEEDS_SETUP" ? "NEEDS_SETUP" : temporal,
        ),
      );
    }
    return out;
  }

  // CALENDAR
  const cadence = row.calendarCadence ?? "DAILY";
  if (
    !calendarMatches({
      serviceDate,
      cadence,
      daysOfWeek: row.calendarDaysOfWeek,
      dayOfMonth: row.calendarDayOfMonth,
    })
  ) {
    return [];
  }

  const dueLocal = row.calendarDueTimeLocal ?? "00:00";
  const endLocal = row.calendarDueTimeLocal ?? "23:59";
  const instants = resolveCycleWindowInstants({
    operationalDateKey,
    startLocal: dueLocal === "00:00" ? "00:00" : dueLocal,
    endLocal: endLocal === dueLocal ? "23:59" : endLocal,
    overnight: false,
    facilityTimezone: input.facilityTimezone,
  });
  const scheduleKindCal: OperationalTemplateScheduleKind = "ONCE_PER_OPERATIONAL_DATE";
  const requirementKey = buildLogRequirementKey({
    attachmentStableKey: row.stableKey,
    catalogStableKey: row.catalogStableKey,
    scheduleKind: scheduleKindCal,
    windowStartLocal: dueLocal,
    windowEndLocal: "23:59",
    target,
    operationalDateKey,
  });
  const temporal = deriveWindowProductState({
    now,
    windowStartsAt: instants?.startsAt ?? null,
    windowEndsAt: instants?.endsAt ?? null,
    isAdHoc: false,
  });
  out.push(
    applyRecordState(
      {
        ...needsSetupBase,
        requirementKey,
        scheduleKind: scheduleKindCal,
        cycleStableKey: null,
        cycleLabel: null,
        windowStartLocal: dueLocal,
        windowEndLocal: "23:59",
        windowStartsAt: instants?.startsAt ?? null,
        windowEndsAt: instants?.endsAt ?? null,
      },
      matchRecord(input.existingRecords, requirementKey),
      temporal,
    ),
  );
  return out;
}
