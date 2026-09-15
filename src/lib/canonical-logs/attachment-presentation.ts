/**
 * Attachment list / readiness presentation for BUILD target Logs sections.
 */

import type {
  LogAttachment,
  LogAttachmentCalendarCadence,
  LogAttachmentStatus,
  LogAttachmentTimingMode,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import { evaluateAttachmentNeedsSetup } from "@/lib/logs-architecture/timing";
import { daypartWindowsForCadence } from "@/lib/logs-architecture/timing";
import type { LogAttachmentTarget } from "@/lib/logs-architecture/types";

import {
  formatTimingSummary,
  scheduleSourceLabel,
} from "./timing-display";

type Db = PrismaClient | Prisma.TransactionClient;

export type AttachmentProductStatus = "Active" | "Inactive" | "Retired" | "Needs setup";

export type AttachmentListItem = {
  id: string;
  stableKey: string;
  displayName: string;
  catalogName: string;
  catalogStableKey: string;
  catalogVersion: number;
  status: LogAttachmentStatus;
  productStatus: AttachmentProductStatus;
  /** Primary operational chip — Needs setup wins over Active when both apply. */
  primaryStateLabel: string;
  timingSummary: string;
  scheduleSourceLabel: string | null;
  needsSetup: boolean;
  needsSetupReason: string | null;
  departmentId: string;
  departmentName: string | null;
  effectiveFromKey: string;
  localDisplayLabel: string | null;
  localInstructions: string | null;
  timingMode: LogAttachmentTimingMode;
  editHref: string;
};

function targetFromRow(row: {
  targetKind: LogAttachment["targetKind"];
  assetId: string | null;
  spaceId: string | null;
  unitId: string | null;
  targetDepartmentId: string | null;
}): LogAttachmentTarget {
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
  }
}

export function attachmentStatusLabel(status: LogAttachmentStatus): Exclude<AttachmentProductStatus, "Needs setup"> {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "INACTIVE":
      return "Inactive";
    case "RETIRED":
      return "Retired";
  }
}

function usingRecommendedWindows(input: {
  recommendedCadence: Parameters<typeof daypartWindowsForCadence>[0];
  windows: ReadonlyArray<{ label: string; startLocal: string; endLocal: string }>;
}): boolean {
  const defaults = daypartWindowsForCadence(input.recommendedCadence);
  if (defaults.length === 0 || defaults.length !== input.windows.length) return false;
  return defaults.every((d, i) => {
    const w = input.windows[i]!;
    return (
      d.label === w.label && d.startLocal === w.startLocal && d.endLocal === w.endLocal
    );
  });
}

export function presentLogAttachment(input: {
  row: {
    id: string;
    stableKey: string;
    status: LogAttachmentStatus;
    timingMode: LogAttachmentTimingMode;
    allowAdHoc: boolean;
    calendarCadence: LogAttachmentCalendarCadence | null;
    calendarDaysOfWeek: number[];
    calendarDayOfMonth: number | null;
    calendarDueTimeLocal: string | null;
    localDisplayLabel: string | null;
    localInstructions: string | null;
    departmentId: string;
    effectiveFrom: Date;
    catalogStableKey: string;
    catalogVersion: number;
    targetKind: LogAttachment["targetKind"];
    assetId: string | null;
    spaceId: string | null;
    unitId: string | null;
    targetDepartmentId: string | null;
    dailyWindows: Array<{ label: string; startLocal: string; endLocal: string }>;
    cycleSelections: Array<{ cycleStableKey: string }>;
    catalogDefinition: {
      name: string;
      recommendedCadence: Parameters<typeof daypartWindowsForCadence>[0];
    };
    department?: { name: string } | null;
  };
  cycleLabelByKey: ReadonlyMap<string, string>;
  publishedCycleStableKeys: readonly string[];
}): AttachmentListItem {
  const { row } = input;
  const cycleKeys = row.cycleSelections.map((c) => c.cycleStableKey);
  const cycleLabels = cycleKeys.map((k) => input.cycleLabelByKey.get(k) ?? k);

  const timingSource =
    row.timingMode === "DAILY_WINDOWS"
      ? ("DAILY_WINDOWS" as const)
      : row.timingMode === "OPERATIONAL_CYCLE"
        ? ("OPERATIONAL_CYCLE" as const)
        : row.timingMode === "CALENDAR"
          ? ("CALENDAR" as const)
          : ("AD_HOC" as const);

  const readiness = evaluateAttachmentNeedsSetup({
    attachment: {
      status: row.status,
      target: targetFromRow(row),
      timing: {
        source: timingSource,
        cycleStableKeys: cycleKeys,
        dailyWindows: row.dailyWindows,
        calendar:
          row.timingMode === "CALENDAR"
            ? {
                cadenceType: row.calendarCadence ?? "DAILY",
                daysOfWeek: row.calendarDaysOfWeek,
                dayOfMonth: row.calendarDayOfMonth,
                dueTimeLocal: row.calendarDueTimeLocal,
              }
            : null,
        allowAdHoc: row.allowAdHoc,
      },
    },
    publishedCycleStableKeys: input.publishedCycleStableKeys,
  });

  const usingRecommended =
    row.timingMode === "DAILY_WINDOWS" &&
    usingRecommendedWindows({
      recommendedCadence: row.catalogDefinition.recommendedCadence,
      windows: row.dailyWindows,
    });

  const timingSummary = formatTimingSummary({
    timingMode: row.timingMode,
    recommendedCadence: row.catalogDefinition.recommendedCadence,
    dailyWindows: row.dailyWindows,
    cycleLabels,
    calendarCadence: row.calendarCadence,
    calendarDaysOfWeek: row.calendarDaysOfWeek,
    calendarDayOfMonth: row.calendarDayOfMonth,
    calendarDueTimeLocal: row.calendarDueTimeLocal,
    allowAdHoc: row.allowAdHoc,
    usingRecommendedSchedule: usingRecommended,
  });

  const statusLabel = attachmentStatusLabel(row.status);
  const needsSetup = readiness.needsSetup;
  const primaryStateLabel = needsSetup ? "Needs setup" : statusLabel;

  const catalogName = row.catalogDefinition.name;
  const displayName = row.localDisplayLabel?.trim() || catalogName;

  const effectiveFromKey = `${row.effectiveFrom.getUTCFullYear()}-${String(row.effectiveFrom.getUTCMonth() + 1).padStart(2, "0")}-${String(row.effectiveFrom.getUTCDate()).padStart(2, "0")}`;

  return {
    id: row.id,
    stableKey: row.stableKey,
    displayName,
    catalogName,
    catalogStableKey: row.catalogStableKey,
    catalogVersion: row.catalogVersion,
    status: row.status,
    productStatus: needsSetup ? "Needs setup" : statusLabel,
    primaryStateLabel,
    timingSummary,
    scheduleSourceLabel:
      row.timingMode === "DAILY_WINDOWS" || row.timingMode === "OPERATIONAL_CYCLE"
        ? scheduleSourceLabel(usingRecommended || (row.timingMode === "OPERATIONAL_CYCLE" && !needsSetup))
        : row.timingMode === "AD_HOC"
          ? null
          : null,
    needsSetup,
    needsSetupReason: readiness.reason,
    departmentId: row.departmentId,
    departmentName: row.department?.name ?? null,
    effectiveFromKey,
    localDisplayLabel: row.localDisplayLabel,
    localInstructions: row.localInstructions,
    timingMode: row.timingMode,
    editHref: `/build/logs/attachments/${row.id}`,
  };
}

const listInclude = {
  dailyWindows: { orderBy: { displaySequence: "asc" as const } },
  cycleSelections: { orderBy: { displaySequence: "asc" as const } },
  catalogDefinition: { select: { name: true, recommendedCadence: true } },
  department: { select: { name: true } },
} satisfies Prisma.LogAttachmentInclude;

export async function listAttachmentsForTarget(
  client: Db,
  input: {
    facilityId: string;
    targetKind: LogAttachment["targetKind"];
    assetId?: string | null;
    spaceId?: string | null;
    unitId?: string | null;
    targetDepartmentId?: string | null;
    cycleLabelByKey: ReadonlyMap<string, string>;
    publishedCycleStableKeys: readonly string[];
  },
): Promise<AttachmentListItem[]> {
  const rows = await client.logAttachment.findMany({
    where: {
      facilityId: input.facilityId,
      targetKind: input.targetKind,
      assetId: input.assetId ?? undefined,
      spaceId: input.spaceId ?? undefined,
      unitId: input.unitId ?? undefined,
      targetDepartmentId: input.targetDepartmentId ?? undefined,
      status: { in: ["ACTIVE", "INACTIVE"] },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: listInclude,
  });

  return rows.map((row) =>
    presentLogAttachment({
      row,
      cycleLabelByKey: input.cycleLabelByKey,
      publishedCycleStableKeys: input.publishedCycleStableKeys,
    }),
  );
}

export async function listFacilityAttachments(
  client: Db,
  input: {
    facilityId: string;
    departmentId?: string | null;
    cycleLabelByKey: ReadonlyMap<string, string>;
    publishedCycleStableKeysByDepartment: ReadonlyMap<string, readonly string[]>;
  },
): Promise<AttachmentListItem[]> {
  const rows = await client.logAttachment.findMany({
    where: {
      facilityId: input.facilityId,
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      status: { in: ["ACTIVE", "INACTIVE", "RETIRED"] },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      ...listInclude,
      asset: { select: { name: true } },
      space: { select: { name: true } },
      unit: { select: { name: true } },
      targetDepartment: { select: { name: true } },
    },
  });

  return rows.map((row) => {
    const published =
      input.publishedCycleStableKeysByDepartment.get(row.departmentId) ?? [];
    return presentLogAttachment({
      row,
      cycleLabelByKey: input.cycleLabelByKey,
      publishedCycleStableKeys: published,
    });
  });
}
