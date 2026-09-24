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

import { describeAttachmentStart } from "./effective-from";
import {
  formatTimingSummary,
  scheduleSourceLabel,
} from "./timing-display";
import {
  groupLogicalLogAttachments,
  logicalAttachmentsForBuildList,
} from "./logical-attachment";

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
  isUpcoming: boolean;
  startsOnLabel: string | null;
  effectiveLabel: string;
  targetLabel: string | null;
  targetHref: string | null;
  runHref: string | null;
  localDisplayLabel: string | null;
  localInstructions: string | null;
  timingMode: LogAttachmentTimingMode;
  editHref: string;
  usingRecommendedSchedule: boolean;
  updateAvailable: boolean;
  latestCatalogVersion: number | null;
  priorSegmentCount: number;
};

function targetFromRow(row: {
  targetKind: LogAttachment["targetKind"];
  assetId: string | null;
  spaceId: string | null;
  unitId: string | null;
  targetDepartmentId: string | null;
  operationalTypeKey?: string | null;
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
    case "OPERATIONAL_TYPE":
      return { kind: "OPERATIONAL_TYPE", operationalTypeKey: row.operationalTypeKey! };
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

export function attachmentTargetBuildHref(input: {
  targetKind: LogAttachment["targetKind"];
  assetId?: string | null;
  spaceId?: string | null;
  unitId?: string | null;
  targetDepartmentId?: string | null;
  departmentId?: string | null;
}): string | null {
  switch (input.targetKind) {
    case "ASSET":
      return input.assetId ? `/build/logs/targets/asset/${input.assetId}` : null;
    case "SPACE":
      return input.spaceId ? `/build/logs/targets/space/${input.spaceId}` : null;
    case "UNIT":
      return input.unitId ? `/build/logs/targets/unit/${input.unitId}` : null;
    case "DEPARTMENT":
      return input.targetDepartmentId ? `/admin/departments/${input.targetDepartmentId}` : null;
    case "OPERATIONAL_TYPE":
      return input.departmentId
        ? `/admin/departments/${input.departmentId}?tab=locations`
        : "/build/logs";
    default:
      return null;
  }
}

export function attachmentTargetRunHref(input: {
  targetKind: LogAttachment["targetKind"];
  assetId?: string | null;
  spaceId?: string | null;
  unitId?: string | null;
  targetDepartmentId?: string | null;
}): string | null {
  switch (input.targetKind) {
    case "ASSET":
      return input.assetId ? `/assets/${input.assetId}` : null;
    case "SPACE":
      return input.spaceId ? `/staffing/logs/targets/space/${input.spaceId}` : null;
    case "UNIT":
      return input.unitId ? `/staffing/logs/targets/unit/${input.unitId}` : null;
    case "DEPARTMENT":
      return input.targetDepartmentId
        ? `/staffing/logs/targets/department/${input.targetDepartmentId}`
        : null;
    case "OPERATIONAL_TYPE":
      return "/staffing/logs";
    default:
      return null;
  }
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
  latestPublishedVersion?: number | null;
  priorSegmentCount?: number;
  todayKey?: string | null;
  targetLabel?: string | null;
  targetHref?: string | null;
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
  const start = input.todayKey
    ? describeAttachmentStart({ effectiveFromKey, todayKey: input.todayKey })
    : { isUpcoming: false, startsOnLabel: null, effectiveLabel: effectiveFromKey };

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
      row.timingMode === "DAILY_WINDOWS"
        ? scheduleSourceLabel(usingRecommended)
        : row.timingMode === "OPERATIONAL_CYCLE" && !needsSetup
          ? "Using Operational Cycles"
          : row.timingMode === "AD_HOC"
            ? null
            : usingRecommended
              ? scheduleSourceLabel(true)
              : "Custom schedule",
    needsSetup,
    needsSetupReason: readiness.reason,
    departmentId: row.departmentId,
    departmentName: row.department?.name ?? null,
    effectiveFromKey,
    isUpcoming: start.isUpcoming,
    startsOnLabel: start.startsOnLabel,
    effectiveLabel: start.effectiveLabel,
    targetLabel: input.targetLabel ?? null,
    targetHref: input.targetHref ?? attachmentTargetBuildHref(row),
    runHref: attachmentTargetRunHref(row),
    localDisplayLabel: row.localDisplayLabel,
    localInstructions: row.localInstructions,
    timingMode: row.timingMode,
    editHref: `/build/logs/attachments/${row.id}`,
    usingRecommendedSchedule: usingRecommended,
    updateAvailable:
      input.latestPublishedVersion != null && input.latestPublishedVersion > row.catalogVersion,
    latestCatalogVersion: input.latestPublishedVersion ?? null,
    priorSegmentCount: input.priorSegmentCount ?? 0,
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
    todayKey?: string | null;
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
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: listInclude,
  });

  const latestByKey = await loadLatestPublishedVersions(
    client,
    rows.map((r) => r.catalogStableKey),
  );
  const groups = logicalAttachmentsForBuildList(
    groupLogicalLogAttachments(rows, latestByKey),
  );

  return groups.map((group) => {
    const row = rows.find((r) => r.id === group.current.id);
    if (!row) {
      throw new Error("Logical Attachment current segment missing from query.");
    }
    return presentLogAttachment({
      row,
      cycleLabelByKey: input.cycleLabelByKey,
      publishedCycleStableKeys: input.publishedCycleStableKeys,
      latestPublishedVersion: group.latestPublishedCatalogVersion,
      priorSegmentCount: group.prior.length,
      todayKey: input.todayKey,
    });
  });
}

export async function listFacilityAttachments(
  client: Db,
  input: {
    facilityId: string;
    departmentId?: string | null;
    cycleLabelByKey: ReadonlyMap<string, string>;
    publishedCycleStableKeysByDepartment: ReadonlyMap<string, readonly string[]>;
    todayKey?: string | null;
  },
): Promise<AttachmentListItem[]> {
  const rows = await client.logAttachment.findMany({
    where: {
      facilityId: input.facilityId,
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      ...listInclude,
      asset: {
        select: {
          name: true,
          unit: { select: { name: true } },
          space: { select: { name: true } },
        },
      },
      space: { select: { name: true, unit: { select: { name: true } } } },
      unit: { select: { name: true } },
      targetDepartment: { select: { name: true } },
    },
  });

  const latestByKey = await loadLatestPublishedVersions(
    client,
    rows.map((r) => r.catalogStableKey),
  );
  const groups = logicalAttachmentsForBuildList(
    groupLogicalLogAttachments(rows, latestByKey),
  );

  return groups.map((group) => {
    const row = rows.find((r) => r.id === group.current.id);
    if (!row) {
      throw new Error("Logical Attachment current segment missing from query.");
    }
    const published =
      input.publishedCycleStableKeysByDepartment.get(row.departmentId) ?? [];
    return presentLogAttachment({
      row,
      cycleLabelByKey: input.cycleLabelByKey,
      publishedCycleStableKeys: published,
      latestPublishedVersion: group.latestPublishedCatalogVersion,
      priorSegmentCount: group.prior.length,
      todayKey: input.todayKey,
      targetLabel: facilityAttachmentWhereLabel(row),
      targetHref: attachmentTargetBuildHref(row),
    });
  });
}

function facilityAttachmentWhereLabel(row: {
  targetKind: LogAttachment["targetKind"];
  asset: {
    name: string;
    unit: { name: string } | null;
    space: { name: string } | null;
  } | null;
  space: { name: string; unit: { name: string } | null } | null;
  unit: { name: string } | null;
  targetDepartment: { name: string } | null;
}): string {
  switch (row.targetKind) {
    case "ASSET": {
      const asset = row.asset;
      if (!asset) return "Asset";
      const loc = [asset.unit?.name, asset.space?.name].filter(Boolean).join(" → ");
      return loc ? `${loc} → ${asset.name}` : asset.name;
    }
    case "SPACE": {
      if (!row.space) return "Room";
      return row.space.unit?.name ? `${row.space.unit.name} → ${row.space.name}` : row.space.name;
    }
    case "UNIT":
      return row.unit?.name ?? "Unit";
    case "DEPARTMENT":
      return row.targetDepartment?.name ?? "Department";
    default:
      return "Facility";
  }
}

async function loadLatestPublishedVersions(
  client: Db,
  stableKeys: readonly string[],
): Promise<Map<string, number>> {
  const keys = [...new Set(stableKeys.filter(Boolean))];
  if (keys.length === 0) return new Map();
  const published = await client.catalogLogDefinition.findMany({
    where: { stableKey: { in: keys }, status: "PUBLISHED" },
    select: { stableKey: true, version: true },
    orderBy: { version: "desc" },
  });
  const map = new Map<string, number>();
  for (const row of published) {
    if (!map.has(row.stableKey)) map.set(row.stableKey, row.version);
  }
  return map;
}
