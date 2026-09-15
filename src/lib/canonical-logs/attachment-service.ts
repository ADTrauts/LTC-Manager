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
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { targetIdentityKey } from "@/lib/logs-architecture/attachment-rules";

import {
  timingFingerprintFromAttachment,
  validateAttachmentTarget,
  type AttachmentTargetInput,
} from "./attachment-validate";

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
  const calendarDaysOfWeek = timingMode === "CALENDAR" ? (input.calendarDaysOfWeek ?? []) : [];
  const calendarDayOfMonth =
    timingMode === "CALENDAR" ? (input.calendarDayOfMonth ?? null) : null;
  const calendarDueTimeLocal =
    timingMode === "CALENDAR" ? (input.calendarDueTimeLocal ?? null) : null;

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

  const fingerprint = timingFingerprintFromAttachment({
    timingMode,
    dailyWindows,
    cycleStableKeys,
    calendarCadence,
    calendarDaysOfWeek,
    calendarDayOfMonth,
    calendarDueTimeLocal,
    allowAdHoc,
  });

  const existingActive = await client.logAttachment.findMany({
    where: {
      facilityId: input.facilityId,
      catalogStableKey: catalog.stableKey,
      status: "ACTIVE",
      targetKind: target.targetKind,
      assetId: target.assetId,
      spaceId: target.spaceId,
      unitId: target.unitId,
      targetDepartmentId: target.targetDepartmentId,
    },
    include: {
      dailyWindows: true,
      cycleSelections: true,
    },
  });

  for (const row of existingActive) {
    const existingFp = timingFingerprintFromAttachment({
      timingMode: row.timingMode,
      dailyWindows: row.dailyWindows,
      cycleStableKeys: row.cycleSelections.map((c) => c.cycleStableKey),
      calendarCadence: row.calendarCadence,
      calendarDaysOfWeek: row.calendarDaysOfWeek,
      calendarDayOfMonth: row.calendarDayOfMonth,
      calendarDueTimeLocal: row.calendarDueTimeLocal,
      allowAdHoc: row.allowAdHoc,
    });
    // Same logical Catalog + target + timing fingerprint → reject.
    // Also require same catalog version for duplicate detection.
    if (row.catalogVersion === catalog.version && existingFp === fingerprint) {
      const key = targetIdentityKey(target.target, input.facilityId);
      throw new Error(
        `An active Attachment already exists for Catalog "${catalog.stableKey}" on ${key} with equivalent timing.`,
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

export async function setLogAttachmentStatus(
  client: Db,
  input: {
    facilityId: string;
    attachmentId: string;
    status: LogAttachmentStatus;
  },
) {
  requireFlag();
  const row = await client.logAttachment.findFirst({
    where: { id: input.attachmentId, facilityId: input.facilityId },
  });
  if (!row) throw new Error("Attachment not found.");

  return client.logAttachment.update({
    where: { id: row.id },
    data: {
      status: input.status,
      retiredAt: input.status === "RETIRED" ? new Date() : row.retiredAt,
    },
    include: attachmentInclude,
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
};

/**
 * Update facility-local Attachment config. Catalog fields/ranges are never writable here.
 */
export async function updateLogAttachment(client: PrismaClient, input: UpdateLogAttachmentInput) {
  requireFlag();
  const existing = await client.logAttachment.findFirst({
    where: { id: input.attachmentId, facilityId: input.facilityId },
    include: { dailyWindows: true, cycleSelections: true },
  });
  if (!existing) throw new Error("Attachment not found.");
  if (existing.status === "RETIRED" && input.status !== "ACTIVE" && input.status !== "INACTIVE") {
    throw new Error("Retired Attachments cannot be edited. Create a new Attachment instead.");
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
  const calendarDaysOfWeek =
    input.calendarDaysOfWeek ?? existing.calendarDaysOfWeek;
  const calendarDayOfMonth =
    input.calendarDayOfMonth !== undefined
      ? input.calendarDayOfMonth
      : existing.calendarDayOfMonth;
  const calendarDueTimeLocal =
    input.calendarDueTimeLocal !== undefined
      ? input.calendarDueTimeLocal
      : existing.calendarDueTimeLocal;

  if (timingMode === "DAILY_WINDOWS" && dailyWindows.length === 0 && !allowAdHoc) {
    throw new Error("DAILY_WINDOWS timing requires at least one window.");
  }

  return client.$transaction(async (tx) => {
    await tx.logAttachmentDailyWindow.deleteMany({ where: { attachmentId: existing.id } });
    await tx.logAttachmentCycleSelection.deleteMany({ where: { attachmentId: existing.id } });

    return tx.logAttachment.update({
      where: { id: existing.id },
      data: {
        timingMode,
        allowAdHoc,
        calendarCadence: timingMode === "CALENDAR" ? calendarCadence : null,
        calendarDaysOfWeek: timingMode === "CALENDAR" ? calendarDaysOfWeek : [],
        calendarDayOfMonth: timingMode === "CALENDAR" ? calendarDayOfMonth : null,
        calendarDueTimeLocal: timingMode === "CALENDAR" ? calendarDueTimeLocal : null,
        localDisplayLabel:
          input.localDisplayLabel !== undefined
            ? input.localDisplayLabel?.trim() || null
            : existing.localDisplayLabel,
        localInstructions:
          input.localInstructions !== undefined
            ? input.localInstructions?.trim() || null
            : existing.localInstructions,
        status: input.status ?? existing.status,
        retiredAt:
          (input.status ?? existing.status) === "RETIRED"
            ? existing.retiredAt ?? new Date()
            : null,
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
  });
}
