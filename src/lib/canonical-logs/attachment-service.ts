import type {
  LogAttachmentCalendarCadence,
  LogAttachmentStatus,
  LogAttachmentTimingMode,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { randomBytes } from "node:crypto";

import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { daypartWindowsForCadence } from "@/lib/logs-architecture/timing";
import { parseRecommendedWeekdays } from "@/lib/logs-architecture/recommended-weekdays";
import { targetIdentityKey } from "@/lib/logs-architecture/attachment-rules";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

import {
  validateAttachmentTarget,
  type AttachmentTargetInput,
} from "./attachment-validate";
import {
  attachmentRangesOverlap,
  classifyAttachmentUpdate,
  effectiveFromKeyFromDate,
  type AttachmentHistoricalSnapshot,
} from "./attachment-update-policy";

type Db = PrismaClient | Prisma.TransactionClient;

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function requireFlag() {
  if (!isCanonicalLogsEnabled()) {
    throw new Error("Canonical Logs are not enabled (CANONICAL_LOGS_ENABLED).");
  }
}

const attachmentInclude = {
  dailyWindows: { orderBy: { displaySequence: "asc" as const } },
  cycleSelections: { orderBy: { displaySequence: "asc" as const } },
  catalogDefinition: {
    include: { fields: { orderBy: { displaySequence: "asc" as const } } },
  },
} satisfies Prisma.LogAttachmentInclude;

export type CreateLogAttachmentInput = {
  facilityId: string;
  departmentId: string;
  catalogDefinitionId: string;
  target: AttachmentTargetInput;
  timingMode?: LogAttachmentTimingMode;
  /** When omitted and Catalog recommends twice-daily etc., defaults apply. */
  dailyWindows?: Array<{ label: string; startLocal: string; endLocal: string }>;
  cycleStableKeys?: string[];
  calendarCadence?: LogAttachmentCalendarCadence | null;
  calendarDaysOfWeek?: number[];
  calendarDayOfMonth?: number | null;
  calendarDueTimeLocal?: string | null;
  allowAdHoc?: boolean;
  localDisplayLabel?: string | null;
  localInstructions?: string | null;
  /** Facility-local YYYY-MM-DD. Defaults to today UTC-date key if omitted — callers should pass facility service date. */
  effectiveFromKey: string;
  effectiveToKey?: string | null;
  stableKey?: string;
};

export async function loadLogAttachmentForFacility(
  client: Db,
  facilityId: string,
  attachmentId: string,
) {
  return client.logAttachment.findFirst({
    where: { id: attachmentId, facilityId },
    include: attachmentInclude,
  });
}

export async function createLogAttachment(client: Db, input: CreateLogAttachmentInput) {
  requireFlag();

  const catalog = await client.catalogLogDefinition.findUnique({
    where: { id: input.catalogDefinitionId },
    include: { fields: { orderBy: { displaySequence: "asc" } } },
  });
  if (!catalog) throw new Error("Catalog definition not found.");
  if (catalog.status !== "PUBLISHED") {
    throw new Error("Attachments may only reference a published Catalog version.");
  }

  const target = await validateAttachmentTarget({
    client,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    target: input.target,
  });

  const timingMode: LogAttachmentTimingMode =
    input.timingMode ??
    (catalog.recommendedScheduleKind === "OPERATIONAL_CYCLE"
      ? "OPERATIONAL_CYCLE"
      : catalog.recommendedCadence === "AD_HOC"
        ? "AD_HOC"
        : catalog.recommendedCadence === "WEEKLY" || catalog.recommendedCadence === "MONTHLY"
          ? "CALENDAR"
          : "DAILY_WINDOWS");

  let dailyWindows = input.dailyWindows ?? [];
  if (timingMode === "DAILY_WINDOWS" && dailyWindows.length === 0) {
    dailyWindows = daypartWindowsForCadence(catalog.recommendedCadence).map((w) => ({
      label: w.label,
      startLocal: w.startLocal,
      endLocal: w.endLocal,
    }));
  }

  const cycleStableKeys = input.cycleStableKeys ?? [];
  const allowAdHoc = input.allowAdHoc ?? timingMode === "AD_HOC";

  if (timingMode === "OPERATIONAL_CYCLE" && cycleStableKeys.length === 0) {
    // Allowed to create, but Needs Setup until cycles selected (derived at resolve time).
  }

  if (timingMode === "DAILY_WINDOWS" && dailyWindows.length === 0 && !allowAdHoc) {
    throw new Error("DAILY_WINDOWS timing requires at least one window.");
  }

  const calendarCadence = timingMode === "CALENDAR" ? (input.calendarCadence ?? "DAILY") : null;
  let calendarDaysOfWeek = timingMode === "CALENDAR" ? (input.calendarDaysOfWeek ?? []) : [];
  const calendarDayOfMonth =
    timingMode === "CALENDAR" ? (input.calendarDayOfMonth ?? null) : null;
  const calendarDueTimeLocal =
    timingMode === "CALENDAR" ? (input.calendarDueTimeLocal ?? null) : null;

  if (timingMode === "CALENDAR" && calendarCadence === "WEEKLY" && calendarDaysOfWeek.length === 0) {
    calendarDaysOfWeek = parseRecommendedWeekdays(catalog.recommendedDaypartLabels).daysOfWeek;
  }
  if (timingMode === "CALENDAR" && calendarCadence === "WEEKLY" && calendarDaysOfWeek.length === 0) {
    throw new Error("Weekly calendar timing requires at least one weekday.");
  }
  if (
    timingMode === "CALENDAR" &&
    calendarCadence === "MONTHLY" &&
    (calendarDayOfMonth == null || calendarDayOfMonth < 1)
  ) {
    throw new Error("Monthly calendar timing requires a day of month.");
  }

  const fingerprintFrom = input.effectiveFromKey;
  const fingerprintTo = input.effectiveToKey ?? null;
  const existingSameTarget = await client.logAttachment.findMany({
    where: {
      facilityId: input.facilityId,
      catalogStableKey: catalog.stableKey,
      targetKind: target.targetKind,
      assetId: target.assetId,
      spaceId: target.spaceId,
      unitId: target.unitId,
      targetDepartmentId: target.targetDepartmentId,
      operationalTypeKey: target.operationalTypeKey,
      ...(target.targetKind === "OPERATIONAL_TYPE" ? { departmentId: input.departmentId } : {}),
    },
    select: { effectiveFrom: true, effectiveTo: true },
  });

  for (const row of existingSameTarget) {
    if (
      attachmentRangesOverlap(
        {
          fromKey: toServiceDateKey(row.effectiveFrom),
          toKey: row.effectiveTo ? toServiceDateKey(row.effectiveTo) : null,
        },
        { fromKey: fingerprintFrom, toKey: fingerprintTo },
      )
    ) {
      const key = targetIdentityKey(target.target, input.facilityId);
      throw new Error(
        `An active Attachment already exists for Catalog "${catalog.stableKey}" on ${key}.`,
      );
    }
  }

  const stableKey =
    input.stableKey?.trim() ||
    `${catalog.stableKey}_${target.targetKind.toLowerCase()}_${cuidLike().slice(0, 10)}`;

  return client.logAttachment.create({
    data: {
      id: cuidLike(),
      stableKey,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      catalogDefinitionId: catalog.id,
      catalogStableKey: catalog.stableKey,
      catalogVersion: catalog.version,
      status: "ACTIVE",
      effectiveFrom: facilityLocalDateToServiceDate(input.effectiveFromKey),
      effectiveTo: input.effectiveToKey
        ? facilityLocalDateToServiceDate(input.effectiveToKey)
        : null,
      localDisplayLabel: input.localDisplayLabel?.trim() || null,
      localInstructions: input.localInstructions?.trim() || null,
      targetKind: target.targetKind,
      assetId: target.assetId,
      spaceId: target.spaceId,
      unitId: target.unitId,
      targetDepartmentId: target.targetDepartmentId,
      operationalTypeKey: target.operationalTypeKey,
      timingMode,
      calendarCadence,
      calendarDaysOfWeek,
      calendarDayOfMonth,
      calendarDueTimeLocal,
      allowAdHoc,
      dailyWindows: {
        create: dailyWindows.map((w, i) => ({
          id: cuidLike(),
          label: w.label,
          startLocal: w.startLocal,
          endLocal: w.endLocal,
          displaySequence: (i + 1) * 10,
        })),
      },
      cycleSelections: {
        create: cycleStableKeys.map((key, i) => ({
          id: cuidLike(),
          cycleStableKey: key,
          displaySequence: (i + 1) * 10,
        })),
      },
    },
    include: attachmentInclude,
  });
}

async function resolveTodayKey(
  client: Db,
  facilityId: string,
  todayKey?: string,
  now?: Date,
): Promise<string> {
  if (todayKey) return todayKey;
  const tz = await loadFacilityTimezone(client, facilityId);
  return toServiceDateKey(getFacilityServiceDate(tz, now ?? new Date()));
}

function snapshotFromRow(row: {
  timingMode: string;
  dailyWindows: Array<{ label: string; startLocal: string; endLocal: string }>;
  cycleSelections?: Array<{ cycleStableKey: string }>;
  cycleStableKeys?: string[];
  calendarCadence: string | null;
  calendarDaysOfWeek: number[];
  calendarDayOfMonth: number | null;
  calendarDueTimeLocal: string | null;
  allowAdHoc: boolean;
  catalogDefinitionId: string;
  catalogVersion: number;
  departmentId: string;
  targetKind: string;
  assetId: string | null;
  spaceId: string | null;
  unitId: string | null;
  targetDepartmentId: string | null;
  operationalTypeKey: string | null;
}): AttachmentHistoricalSnapshot {
  return {
    timingMode: row.timingMode,
    dailyWindows: row.dailyWindows.map((w) => ({
      label: w.label,
      startLocal: w.startLocal,
      endLocal: w.endLocal,
    })),
    cycleStableKeys: row.cycleStableKeys ?? row.cycleSelections?.map((c) => c.cycleStableKey) ?? [],
    calendarCadence: row.calendarCadence,
    calendarDaysOfWeek: row.calendarDaysOfWeek,
    calendarDayOfMonth: row.calendarDayOfMonth,
    calendarDueTimeLocal: row.calendarDueTimeLocal,
    allowAdHoc: row.allowAdHoc,
    catalogDefinitionId: row.catalogDefinitionId,
    catalogVersion: row.catalogVersion,
    departmentId: row.departmentId,
    targetKind: row.targetKind,
    assetId: row.assetId,
    spaceId: row.spaceId,
    unitId: row.unitId,
    targetDepartmentId: row.targetDepartmentId,
    operationalTypeKey: row.operationalTypeKey,
  };
}

async function closeAttachmentSegment(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    closeEffectiveToKey: string;
    nextStatus: LogAttachmentStatus;
    existingEffectiveTo: Date | null;
    existingRetiredAt: Date | null;
  },
) {
  const alreadyClosed = Boolean(input.existingEffectiveTo);
  return tx.logAttachment.update({
    where: { id: input.id },
    data: {
      status: input.nextStatus,
      effectiveTo: alreadyClosed
        ? input.existingEffectiveTo
        : facilityLocalDateToServiceDate(input.closeEffectiveToKey),
      retiredAt:
        input.nextStatus === "RETIRED" ? input.existingRetiredAt ?? new Date() : input.existingRetiredAt,
    },
  });
}

export async function setLogAttachmentStatus(
  client: Db,
  input: {
    facilityId: string;
    attachmentId: string;
    status: LogAttachmentStatus;
    todayKey?: string;
    now?: Date;
  },
) {
  requireFlag();
  return updateLogAttachment(client, {
    facilityId: input.facilityId,
    attachmentId: input.attachmentId,
    status: input.status,
    todayKey: input.todayKey,
    now: input.now,
  });
}

export type UpdateLogAttachmentInput = {
  facilityId: string;
  attachmentId: string;
  timingMode?: LogAttachmentTimingMode;
  dailyWindows?: Array<{ label: string; startLocal: string; endLocal: string }>;
  cycleStableKeys?: string[];
  calendarCadence?: LogAttachmentCalendarCadence | null;
  calendarDaysOfWeek?: number[];
  calendarDayOfMonth?: number | null;
  calendarDueTimeLocal?: string | null;
  allowAdHoc?: boolean;
  localDisplayLabel?: string | null;
  localInstructions?: string | null;
  status?: LogAttachmentStatus;
  effectiveFromKey?: string;
  effectiveToKey?: string | null;
  catalogDefinitionId?: string;
  departmentId?: string;
  target?: AttachmentTargetInput;
  todayKey?: string;
  now?: Date;
};

export type UpdateLogAttachmentResult = Prisma.LogAttachmentGetPayload<{
  include: typeof attachmentInclude;
}>;

/**
 * Prospective Attachment updates.
 * Historical-significant changes on an already-effective row close the current
 * segment and create a successor starting the next facility service date.
 * Display-only edits and not-yet-effective rows may update in place.
 */
export async function updateLogAttachment(
  client: Db,
  input: UpdateLogAttachmentInput,
): Promise<UpdateLogAttachmentResult> {
  requireFlag();
  const existing = await client.logAttachment.findFirst({
    where: { id: input.attachmentId, facilityId: input.facilityId },
    include: { dailyWindows: true, cycleSelections: true },
  });
  if (!existing) throw new Error("Attachment not found.");

  const todayKey = await resolveTodayKey(client, input.facilityId, input.todayKey, input.now);
  const existingFromKey = effectiveFromKeyFromDate(existing.effectiveFrom);
  const existingToKey = existing.effectiveTo ? effectiveFromKeyFromDate(existing.effectiveTo) : null;

  if (existing.status !== "ACTIVE" && existingToKey && input.status !== "ACTIVE") {
    throw new Error("This Attachment segment is closed. Edit the current configuration.");
  }

  let catalogDefinitionId = existing.catalogDefinitionId;
  let catalogVersion = existing.catalogVersion;
  let catalogStableKey = existing.catalogStableKey;
  if (input.catalogDefinitionId && input.catalogDefinitionId !== existing.catalogDefinitionId) {
    const catalog = await client.catalogLogDefinition.findUnique({
      where: { id: input.catalogDefinitionId },
    });
    if (!catalog) throw new Error("Catalog definition not found.");
    if (catalog.status !== "PUBLISHED") {
      throw new Error("Attachments may only reference a published Catalog version.");
    }
    if (catalog.stableKey !== existing.catalogStableKey) {
      throw new Error("Catalog version adoption must stay on the same Catalog Log.");
    }
    catalogDefinitionId = catalog.id;
    catalogVersion = catalog.version;
    catalogStableKey = catalog.stableKey;
  }

  let departmentId = input.departmentId ?? existing.departmentId;
  let targetKind = existing.targetKind;
  let assetId = existing.assetId;
  let spaceId = existing.spaceId;
  let unitId = existing.unitId;
  let targetDepartmentId = existing.targetDepartmentId;
  let operationalTypeKey = existing.operationalTypeKey;
  if (input.target) {
    const validated = await validateAttachmentTarget({
      client,
      facilityId: input.facilityId,
      departmentId,
      target: input.target,
    });
    targetKind = validated.targetKind;
    assetId = validated.assetId;
    spaceId = validated.spaceId;
    unitId = validated.unitId;
    targetDepartmentId = validated.targetDepartmentId;
    operationalTypeKey = validated.operationalTypeKey;
  }

  const timingMode = input.timingMode ?? existing.timingMode;
  const dailyWindows =
    input.dailyWindows ??
    existing.dailyWindows.map((w) => ({
      label: w.label,
      startLocal: w.startLocal,
      endLocal: w.endLocal,
    }));
  const cycleStableKeys =
    input.cycleStableKeys ?? existing.cycleSelections.map((c) => c.cycleStableKey);
  const allowAdHoc = input.allowAdHoc ?? existing.allowAdHoc;
  const calendarCadence =
    input.calendarCadence !== undefined ? input.calendarCadence : existing.calendarCadence;
  const calendarDaysOfWeek = input.calendarDaysOfWeek ?? existing.calendarDaysOfWeek;
  const calendarDayOfMonth =
    input.calendarDayOfMonth !== undefined ? input.calendarDayOfMonth : existing.calendarDayOfMonth;
  const calendarDueTimeLocal =
    input.calendarDueTimeLocal !== undefined
      ? input.calendarDueTimeLocal
      : existing.calendarDueTimeLocal;

  if (timingMode === "DAILY_WINDOWS" && dailyWindows.length === 0 && !allowAdHoc) {
    throw new Error("DAILY_WINDOWS timing requires at least one window.");
  }
  if (timingMode === "CALENDAR" && calendarCadence === "WEEKLY" && calendarDaysOfWeek.length === 0) {
    throw new Error("Weekly calendar timing requires at least one weekday.");
  }
  if (
    timingMode === "CALENDAR" &&
    calendarCadence === "MONTHLY" &&
    (calendarDayOfMonth == null || calendarDayOfMonth < 1)
  ) {
    throw new Error("Monthly calendar timing requires a day of month.");
  }

  const localDisplayLabel =
    input.localDisplayLabel !== undefined
      ? input.localDisplayLabel?.trim() || null
      : existing.localDisplayLabel;
  const localInstructions =
    input.localInstructions !== undefined
      ? input.localInstructions?.trim() || null
      : existing.localInstructions;

  const existingSnap = snapshotFromRow(existing);
  const nextSnap = snapshotFromRow({
    timingMode,
    dailyWindows,
    cycleStableKeys,
    calendarCadence,
    calendarDaysOfWeek,
    calendarDayOfMonth,
    calendarDueTimeLocal,
    allowAdHoc,
    catalogDefinitionId,
    catalogVersion,
    departmentId,
    targetKind,
    assetId,
    spaceId,
    unitId,
    targetDepartmentId,
    operationalTypeKey,
  });

  const classified = classifyAttachmentUpdate({
    effectiveFromKey: existingFromKey,
    todayKey,
    existing: existingSnap,
    next: nextSnap,
    localDisplayLabelChanged: localDisplayLabel !== existing.localDisplayLabel,
    localInstructionsChanged: localInstructions !== existing.localInstructions,
    existingStatus: existing.status,
    nextStatus: input.status ?? existing.status,
    existingEffectiveToKey: existingToKey,
  });

  const run = async (tx: Prisma.TransactionClient): Promise<UpdateLogAttachmentResult> => {
    if (classified.mode === "CLOSE_ONLY") {
      await closeAttachmentSegment(tx, {
        id: existing.id,
        closeEffectiveToKey: classified.closeEffectiveToKey ?? todayKey,
        nextStatus: input.status ?? existing.status,
        existingEffectiveTo: existing.effectiveTo,
        existingRetiredAt: existing.retiredAt,
      });
      const closed = await tx.logAttachment.findFirst({
        where: { id: existing.id },
        include: attachmentInclude,
      });
      if (!closed) throw new Error("Attachment not found.");
      return closed;
    }

    if (classified.mode === "SUCCESSOR") {
      const closeStatus: LogAttachmentStatus =
        existing.status === "RETIRED" ? "RETIRED" : "INACTIVE";
      await closeAttachmentSegment(tx, {
        id: existing.id,
        closeEffectiveToKey: classified.closeEffectiveToKey ?? todayKey,
        nextStatus: closeStatus,
        existingEffectiveTo: existing.effectiveTo,
        existingRetiredAt: existing.retiredAt,
      });

      return createLogAttachment(tx, {
        facilityId: input.facilityId,
        departmentId,
        catalogDefinitionId,
        target: {
          kind: targetKind,
          assetId,
          spaceId,
          unitId,
          targetDepartmentId,
          operationalTypeKey,
        },
        timingMode,
        dailyWindows,
        cycleStableKeys,
        calendarCadence,
        calendarDaysOfWeek,
        calendarDayOfMonth,
        calendarDueTimeLocal,
        allowAdHoc,
        localDisplayLabel,
        localInstructions,
        effectiveFromKey: classified.successorFromKey ?? todayKey,
      });
    }

    const nextStatus = input.status ?? existing.status;
    const timingChanged =
      existingSnap.timingMode !== nextSnap.timingMode ||
      JSON.stringify(existingSnap.dailyWindows) !== JSON.stringify(nextSnap.dailyWindows) ||
      existingSnap.cycleStableKeys.join(",") !== nextSnap.cycleStableKeys.join(",") ||
      existingSnap.calendarCadence !== nextSnap.calendarCadence ||
      existingSnap.calendarDaysOfWeek.join(",") !== nextSnap.calendarDaysOfWeek.join(",") ||
      existingSnap.calendarDayOfMonth !== nextSnap.calendarDayOfMonth ||
      existingSnap.calendarDueTimeLocal !== nextSnap.calendarDueTimeLocal ||
      existingSnap.allowAdHoc !== nextSnap.allowAdHoc ||
      existing.catalogDefinitionId !== catalogDefinitionId;

    if (!timingChanged) {
      return tx.logAttachment.update({
        where: { id: existing.id },
        data: {
          localDisplayLabel,
          localInstructions,
          status: nextStatus,
          departmentId,
          targetKind,
          assetId,
          spaceId,
          unitId,
          targetDepartmentId,
          operationalTypeKey,
          effectiveFrom: input.effectiveFromKey
            ? facilityLocalDateToServiceDate(input.effectiveFromKey)
            : existing.effectiveFrom,
        },
        include: attachmentInclude,
      });
    }

    await tx.logAttachmentDailyWindow.deleteMany({ where: { attachmentId: existing.id } });
    await tx.logAttachmentCycleSelection.deleteMany({ where: { attachmentId: existing.id } });

    return tx.logAttachment.update({
      where: { id: existing.id },
      data: {
        catalogDefinitionId,
        catalogStableKey,
        catalogVersion,
        departmentId,
        targetKind,
        assetId,
        spaceId,
        unitId,
        targetDepartmentId,
        operationalTypeKey,
        timingMode,
        allowAdHoc,
        calendarCadence: timingMode === "CALENDAR" ? calendarCadence : null,
        calendarDaysOfWeek: timingMode === "CALENDAR" ? calendarDaysOfWeek : [],
        calendarDayOfMonth: timingMode === "CALENDAR" ? calendarDayOfMonth : null,
        calendarDueTimeLocal: timingMode === "CALENDAR" ? calendarDueTimeLocal : null,
        localDisplayLabel,
        localInstructions,
        status: nextStatus,
        retiredAt: nextStatus === "RETIRED" ? existing.retiredAt ?? new Date() : null,
        effectiveFrom: input.effectiveFromKey
          ? facilityLocalDateToServiceDate(input.effectiveFromKey)
          : existing.effectiveFrom,
        effectiveTo:
          input.effectiveToKey === undefined
            ? existing.effectiveTo
            : input.effectiveToKey
              ? facilityLocalDateToServiceDate(input.effectiveToKey)
              : null,
        dailyWindows: {
          create: dailyWindows.map((w, i) => ({
            id: cuidLike(),
            label: w.label,
            startLocal: w.startLocal,
            endLocal: w.endLocal,
            displaySequence: (i + 1) * 10,
          })),
        },
        cycleSelections: {
          create: cycleStableKeys.map((key, i) => ({
            id: cuidLike(),
            cycleStableKey: key,
            displaySequence: (i + 1) * 10,
          })),
        },
      },
      include: attachmentInclude,
    });
  };

  if ("$transaction" in client && typeof client.$transaction === "function") {
    return client.$transaction(run);
  }
  return run(client as Prisma.TransactionClient);
}

export async function adoptLogAttachmentCatalogVersion(
  client: Db,
  input: {
    facilityId: string;
    attachmentId: string;
    catalogDefinitionId?: string;
    todayKey?: string;
    now?: Date;
  },
) {
  requireFlag();
  const existing = await client.logAttachment.findFirst({
    where: { id: input.attachmentId, facilityId: input.facilityId },
    select: { catalogStableKey: true, catalogVersion: true, catalogDefinitionId: true },
  });
  if (!existing) throw new Error("Attachment not found.");

  const latest =
    input.catalogDefinitionId
      ? await client.catalogLogDefinition.findUnique({ where: { id: input.catalogDefinitionId } })
      : await client.catalogLogDefinition.findFirst({
          where: { stableKey: existing.catalogStableKey, status: "PUBLISHED" },
          orderBy: { version: "desc" },
        });
  if (!latest || latest.status !== "PUBLISHED") {
    throw new Error("Published Catalog version not found.");
  }
  if (latest.stableKey !== existing.catalogStableKey) {
    throw new Error("Catalog version adoption must stay on the same Catalog Log.");
  }
  if (latest.id === existing.catalogDefinitionId) {
    throw new Error("Already using this Catalog version.");
  }

  return updateLogAttachment(client, {
    facilityId: input.facilityId,
    attachmentId: input.attachmentId,
    catalogDefinitionId: latest.id,
    todayKey: input.todayKey,
    now: input.now,
  });
}
