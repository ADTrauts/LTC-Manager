/**
 * Catalog → many-target Assign picker (BUILD).
 * One Catalog Log, many Attachments. Unassign retires; Evidence stays.
 */

import type { LogAttachmentTargetKind, PrismaClient, UnitHierarchyRole } from "@prisma/client";

import { isActionableDepartmentUnit } from "@/lib/department-administration/department-locations";
import { loadFacilityTimezone } from "@/lib/operational-time";
import {
  operationalTypeAssignId,
  parseOperationalTypeAssignId,
} from "./log-operational-type-applicability";

import { logicalAttachmentsForBuildList, groupLogicalLogAttachments } from "./logical-attachment";
import { catalogMatchesTarget, parseCatalogSuggestions, type CatalogSuggestions } from "./suggestions";
import {
  resolveAttachTimingProposal,
  type ResolvedAttachTiming,
} from "./attach-timing";
import { loadCycleOptionsForDepartment, cycleLabelMap } from "./cycle-options";
import { resolveDefaultAttachmentEffectiveFromKey } from "./effective-from";
import { createLogAttachment, setLogAttachmentStatus } from "./attachment-service";

export type CatalogAssignKind = Exclude<LogAttachmentTargetKind, "FACILITY">;

export type CatalogAssignTargetRow = {
  key: string;
  kind: CatalogAssignKind;
  id: string;
  label: string;
  groupLabel: string | null;
  departmentId: string | null;
  departmentName: string | null;
  suggested: boolean;
  assigned: boolean;
  attachmentId: string | null;
  disabled: boolean;
  disabledReason: string | null;
};

export type CatalogAssignCategory = {
  kind: CatalogAssignKind;
  label: string;
  targets: CatalogAssignTargetRow[];
};

export type CatalogAssignView = {
  catalogStableKey: string;
  catalogName: string;
  catalogDefinitionId: string;
  recommendedCadenceLabel: string;
  timingSummary: string;
  usingRecommendedSchedule: boolean;
  catalogNeedsSetup: boolean;
  catalogNeedsSetupReason: string | null;
  effectiveFromKey: string;
  effectiveLabel: string;
  categories: CatalogAssignCategory[];
};

export function targetAssignKey(kind: CatalogAssignKind, id: string): string {
  return `${kind}:${id}`;
}

/** Floors and Buildings are grouping only — never new UNIT Log targets. */
export function includeUnitInCatalogAssign(input: {
  hierarchyRole: UnitHierarchyRole | null;
  parentUnitId: string | null;
  alreadyAssigned: boolean;
}): boolean {
  if (input.alreadyAssigned) return true;
  return isActionableDepartmentUnit({
    hierarchyRole: input.hierarchyRole,
    parentUnitId: input.parentUnitId,
  });
}

export function parseTargetAssignKey(
  key: string,
): { kind: CatalogAssignKind; id: string } | null {
  const split = key.indexOf(":");
  if (split <= 0) return null;
  const kind = key.slice(0, split);
  const id = key.slice(split + 1);
  if (!id) return null;
  if (
    kind !== "ASSET" &&
    kind !== "SPACE" &&
    kind !== "UNIT" &&
    kind !== "DEPARTMENT" &&
    kind !== "OPERATIONAL_TYPE"
  ) {
    return null;
  }
  return { kind, id };
}

export function computeCatalogAssignDiff(input: {
  selectedKeys: readonly string[];
  liveAssignments: ReadonlyArray<{ key: string; attachmentId: string }>;
}): {
  addKeys: string[];
  remove: Array<{ key: string; attachmentId: string }>;
} {
  const selected = new Set(input.selectedKeys);
  const live = new Map(input.liveAssignments.map((row) => [row.key, row.attachmentId]));
  const addKeys: string[] = [];
  const remove: Array<{ key: string; attachmentId: string }> = [];
  for (const key of selected) {
    if (!live.has(key)) addKeys.push(key);
  }
  for (const [key, attachmentId] of live) {
    if (!selected.has(key)) remove.push({ key, attachmentId });
  }
  return { addKeys, remove };
}

function liveAssignmentMap(
  rows: Array<{
    id: string;
    catalogStableKey: string;
    catalogVersion: number;
    status: "ACTIVE" | "INACTIVE" | "RETIRED";
    effectiveFrom: Date;
    effectiveTo: Date | null;
    targetKind: string;
    assetId: string | null;
    spaceId: string | null;
    unitId: string | null;
    targetDepartmentId: string | null;
    operationalTypeKey?: string | null;
    departmentId?: string | null;
    stableKey: string;
  }>,
): Map<string, string> {
  const groups = groupLogicalLogAttachments(rows);
  const live = logicalAttachmentsForBuildList(groups);
  const map = new Map<string, string>();
  for (const group of live) {
    const current = group.current;
    const kind = current.targetKind as CatalogAssignKind;
    const id =
      kind === "ASSET"
        ? current.assetId
        : kind === "SPACE"
          ? current.spaceId
          : kind === "UNIT"
            ? current.unitId
            : kind === "OPERATIONAL_TYPE"
              ? current.operationalTypeKey && current.departmentId
                ? operationalTypeAssignId(current.departmentId, current.operationalTypeKey)
                : null
              : current.targetDepartmentId;
    if (!id) continue;
    map.set(targetAssignKey(kind, id), current.id);
  }
  return map;
}

function unitGroupLabel(unit: {
  name: string;
  parentUnit: { name: string } | null;
} | null): string | null {
  if (!unit) return null;
  if (unit.parentUnit?.name) return `${unit.parentUnit.name} · ${unit.name}`;
  return unit.name;
}

function resolveUnitDepartment(
  rows: Array<{ kind: string; departmentId: string; department: { id: string; name: string } }>,
): { id: string; name: string } | null {
  const primary = rows.find((r) => r.kind === "PRIMARY");
  if (primary) return primary.department;
  if (rows.length === 1) return rows[0]!.department;
  return null;
}

export async function loadCatalogAssignView(input: {
  client: PrismaClient;
  facilityId: string;
  catalogStableKey: string;
  now?: Date;
}): Promise<CatalogAssignView | null> {
  const catalog = await input.client.catalogLogDefinition.findFirst({
    where: { stableKey: input.catalogStableKey, status: "PUBLISHED" },
    orderBy: { version: "desc" },
    select: {
      id: true,
      stableKey: true,
      name: true,
      recommendedCadence: true,
      recommendedScheduleKind: true,
      recommendedDaypartLabels: true,
      suggestionsJson: true,
    },
  });
  if (!catalog) return null;

  const suggestions: CatalogSuggestions = parseCatalogSuggestions(catalog.suggestionsJson);
  const timezone = await loadFacilityTimezone(input.client, input.facilityId);
  const effective = resolveDefaultAttachmentEffectiveFromKey({
    facilityTimezone: timezone,
    now: input.now,
  });

  const [assets, spaces, units, departments, attachmentRows] = await Promise.all([
    input.client.asset.findMany({
      where: { unit: { facilityId: input.facilityId } },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        equipmentType: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
        unit: { select: { name: true, parentUnit: { select: { name: true } } } },
        space: { select: { name: true } },
      },
    }),
    input.client.unitSpace.findMany({
      where: { facilityId: input.facilityId, isActive: true },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        spaceType: true,
        unit: { select: { name: true, parentUnit: { select: { name: true } } } },
        facilityRoomType: { select: { baseTypeKey: true, displayName: true } },
        responsibilities: {
          select: { departmentId: true, department: { select: { id: true, name: true, key: true } } },
        },
      },
    }),
    input.client.unit.findMany({
      where: { facilityId: input.facilityId, isActive: true },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        hierarchyRole: true,
        parentUnitId: true,
        parentUnit: { select: { name: true } },
        departmentResponsibilities: {
          select: {
            kind: true,
            departmentId: true,
            department: { select: { id: true, name: true, key: true } },
          },
        },
      },
    }),
    input.client.department.findMany({
      where: { facilityId: input.facilityId, isActive: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, key: true },
    }),
    input.client.logAttachment.findMany({
      where: { facilityId: input.facilityId, catalogStableKey: catalog.stableKey },
      select: {
        id: true,
        stableKey: true,
        catalogStableKey: true,
        catalogVersion: true,
        status: true,
        effectiveFrom: true,
        effectiveTo: true,
        targetKind: true,
        assetId: true,
        spaceId: true,
        unitId: true,
        targetDepartmentId: true,
        operationalTypeKey: true,
        departmentId: true,
      },
    }),
  ]);

  const assigned = liveAssignmentMap(attachmentRows);

  const departmentIds = new Set<string>();
  for (const asset of assets) {
    const id = asset.departmentId ?? asset.department?.id;
    if (id) departmentIds.add(id);
  }
  for (const space of spaces) {
    if (space.responsibilities.length === 1) departmentIds.add(space.responsibilities[0]!.departmentId);
  }
  for (const unit of units) {
    const dept = resolveUnitDepartment(unit.departmentResponsibilities);
    if (dept) departmentIds.add(dept.id);
  }
  for (const dept of departments) departmentIds.add(dept.id);

  const cyclesByDepartment = new Map<string, string[]>();
  const cycleLabelByKey = new Map<string, string>();
  await Promise.all(
    [...departmentIds].map(async (departmentId) => {
      const options = await loadCycleOptionsForDepartment(
        input.client,
        input.facilityId,
        departmentId,
        input.now,
      );
      cyclesByDepartment.set(
        departmentId,
        options.map((o) => o.stableKey),
      );
      for (const option of options) cycleLabelByKey.set(option.stableKey, option.label);
    }),
  );

  const recommendedCadence = catalog.recommendedCadence ?? "AD_HOC";
  const recommendedScheduleKind = catalog.recommendedScheduleKind;
  const recommendedDaypartLabels = catalog.recommendedDaypartLabels;

  const displayTiming = resolveAttachTimingProposal({
    recommendedCadence,
    recommendedScheduleKind,
    recommendedDaypartLabels,
    publishedCycleStableKeys: [...cycleLabelByKey.keys()],
    cycleLabelByKey,
  });

  function timingForDepartment(departmentId: string | null): ResolvedAttachTiming {
    const keys = departmentId ? (cyclesByDepartment.get(departmentId) ?? []) : [];
    return resolveAttachTimingProposal({
      recommendedCadence,
      recommendedScheduleKind,
      recommendedDaypartLabels,
      publishedCycleStableKeys: keys,
      cycleLabelByKey,
    });
  }

  const catalogBlocked =
    displayTiming.needsSetup && displayTiming.timingMode !== "OPERATIONAL_CYCLE"
      ? displayTiming.needsSetupReason
      : null;

  const assetRows: CatalogAssignTargetRow[] = assets.map((asset) => {
    const departmentId = asset.departmentId ?? asset.department?.id ?? null;
    const key = targetAssignKey("ASSET", asset.id);
    const suggested = catalogMatchesTarget(suggestions, {
      kind: "ASSET",
      equipmentType: asset.equipmentType,
    });
    const timing = timingForDepartment(departmentId);
    let disabled = false;
    let disabledReason: string | null = null;
    if (!departmentId) {
      disabled = true;
      disabledReason = "No responsible Department.";
    } else if (catalogBlocked) {
      disabled = true;
      disabledReason = catalogBlocked;
    } else if (timing.needsSetup) {
      disabled = true;
      disabledReason = timing.needsSetupReason;
    }
    const isAssigned = assigned.has(key);
    if (isAssigned) {
      disabled = false;
      disabledReason = null;
    }
    const path = [asset.unit?.name, asset.space?.name, asset.name].filter(Boolean).join(" → ");
    return {
      key,
      kind: "ASSET",
      id: asset.id,
      label: path,
      groupLabel: unitGroupLabel(asset.unit),
      departmentId,
      departmentName: asset.department?.name ?? null,
      suggested,
      assigned: isAssigned,
      attachmentId: assigned.get(key) ?? null,
      disabled,
      disabledReason,
    };
  });

  const spaceRows: CatalogAssignTargetRow[] = spaces.map((space) => {
    const key = targetAssignKey("SPACE", space.id);
    const uniqueDepts = [...new Map(space.responsibilities.map((r) => [r.departmentId, r])).values()];
    const department = uniqueDepts.length === 1 ? uniqueDepts[0]!.department : null;
    const suggested = catalogMatchesTarget(suggestions, {
      kind: "SPACE",
      spaceType: space.spaceType,
      roomTypeHints: [
        space.facilityRoomType?.baseTypeKey,
        space.facilityRoomType?.displayName,
        space.name,
      ].filter((x): x is string => Boolean(x)),
    });
    const timing = timingForDepartment(department?.id ?? null);
    let disabled = false;
    let disabledReason: string | null = null;
    if (uniqueDepts.length === 0) {
      disabled = true;
      disabledReason = "No responsible Department.";
    } else if (uniqueDepts.length > 1) {
      disabled = true;
      disabledReason = "Multiple Departments share this room.";
    } else if (catalogBlocked) {
      disabled = true;
      disabledReason = catalogBlocked;
    } else if (timing.needsSetup) {
      disabled = true;
      disabledReason = timing.needsSetupReason;
    }
    const isAssigned = assigned.has(key);
    if (isAssigned) {
      disabled = false;
      disabledReason = null;
    }
    return {
      key,
      kind: "SPACE",
      id: space.id,
      label: space.name,
      groupLabel: unitGroupLabel(space.unit),
      departmentId: department?.id ?? null,
      departmentName: department?.name ?? null,
      suggested,
      assigned: isAssigned,
      attachmentId: assigned.get(key) ?? null,
      disabled,
      disabledReason,
    };
  });

  const unitRows: CatalogAssignTargetRow[] = units.flatMap((unit) => {
    const key = targetAssignKey("UNIT", unit.id);
    const isAssigned = assigned.has(key);
    if (
      !includeUnitInCatalogAssign({
        hierarchyRole: unit.hierarchyRole,
        parentUnitId: unit.parentUnitId,
        alreadyAssigned: isAssigned,
      })
    ) {
      return [];
    }
    const department = resolveUnitDepartment(unit.departmentResponsibilities);
    const suggested = catalogMatchesTarget(suggestions, {
      kind: "UNIT",
      unitName: unit.name,
      departmentKey: unit.departmentResponsibilities[0]?.department.key ?? null,
    });
    const timing = timingForDepartment(department?.id ?? null);
    let disabled = false;
    let disabledReason: string | null = null;
    if (!department) {
      disabled = true;
      disabledReason =
        unit.departmentResponsibilities.length > 1
          ? "Multiple Departments share this unit."
          : "No responsible Department.";
    } else if (catalogBlocked) {
      disabled = true;
      disabledReason = catalogBlocked;
    } else if (timing.needsSetup) {
      disabled = true;
      disabledReason = timing.needsSetupReason;
    }
    if (isAssigned) {
      disabled = false;
      disabledReason = null;
    }
    return [
      {
        key,
        kind: "UNIT",
        id: unit.id,
        label: unit.name,
        groupLabel: unit.parentUnit?.name ?? null,
        departmentId: department?.id ?? null,
        departmentName: department?.name ?? null,
        suggested,
        assigned: isAssigned,
        attachmentId: assigned.get(key) ?? null,
        disabled,
        disabledReason,
      },
    ];
  });

  const departmentRows: CatalogAssignTargetRow[] = departments.map((department) => {
    const key = targetAssignKey("DEPARTMENT", department.id);
    const suggested = catalogMatchesTarget(suggestions, {
      kind: "DEPARTMENT",
      departmentKey: department.key,
    });
    const timing = timingForDepartment(department.id);
    let disabled = false;
    let disabledReason: string | null = null;
    if (catalogBlocked) {
      disabled = true;
      disabledReason = catalogBlocked;
    } else if (timing.needsSetup) {
      disabled = true;
      disabledReason = timing.needsSetupReason;
    }
    const isAssigned = assigned.has(key);
    if (isAssigned) {
      disabled = false;
      disabledReason = null;
    }
    return {
      key,
      kind: "DEPARTMENT",
      id: department.id,
      label: department.name,
      groupLabel: null,
      departmentId: department.id,
      departmentName: department.name,
      suggested,
      assigned: isAssigned,
      attachmentId: assigned.get(key) ?? null,
      disabled,
      disabledReason,
    };
  });

  const leftoverOperationalTypeRows: CatalogAssignTargetRow[] = [];
  for (const [key, attachmentId] of assigned) {
    const parsed = parseTargetAssignKey(key);
    if (parsed?.kind !== "OPERATIONAL_TYPE") continue;
    const operationalType = parseOperationalTypeAssignId(parsed.id);
    if (!operationalType) continue;
    const department = departments.find((row) => row.id === operationalType.departmentId);
    leftoverOperationalTypeRows.push({
      key,
      kind: "OPERATIONAL_TYPE",
      id: parsed.id,
      label: operationalType.operationalTypeKey,
      groupLabel: department?.name ?? null,
      departmentId: operationalType.departmentId,
      departmentName: department?.name ?? null,
      suggested: false,
      assigned: true,
      attachmentId,
      disabled: false,
      disabledReason: null,
    });
  }

  return {
    catalogStableKey: catalog.stableKey,
    catalogName: catalog.name,
    catalogDefinitionId: catalog.id,
    recommendedCadenceLabel: displayTiming.recommendedCadenceLabel,
    timingSummary: displayTiming.timingSummary,
    usingRecommendedSchedule: displayTiming.usingRecommendedSchedule,
    catalogNeedsSetup: Boolean(catalogBlocked),
    catalogNeedsSetupReason: catalogBlocked,
    effectiveFromKey: effective.effectiveFromKey,
    effectiveLabel: effective.label,
    categories: [
      ...(leftoverOperationalTypeRows.length > 0
        ? [
            {
              kind: "OPERATIONAL_TYPE" as const,
              label: "Leftover Operational Types",
              targets: leftoverOperationalTypeRows,
            },
          ]
        : []),
      { kind: "SPACE", label: "Rooms", targets: spaceRows },
      { kind: "ASSET", label: "Assets", targets: assetRows },
      { kind: "UNIT", label: "Units", targets: unitRows },
      { kind: "DEPARTMENT", label: "Departments", targets: departmentRows },
    ],
  };
}

export const CATALOG_UNASSIGN_NOTICE =
  "This Log will no longer be required on the unselected targets. Completed records stay in the Log Book.";

export async function applyCatalogAssignSelection(input: {
  client: PrismaClient;
  facilityId: string;
  catalogStableKey: string;
  selectedKeys: readonly string[];
  now?: Date;
}): Promise<{ added: number; removed: number; skipped: number }> {
  const view = await loadCatalogAssignView(input);
  if (!view) throw new Error("Published Catalog Log not found.");

  const rows = view.categories.flatMap((c) => c.targets);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const liveAssignments = rows
    .filter((row) => row.assigned && row.attachmentId)
    .map((row) => ({ key: row.key, attachmentId: row.attachmentId! }));

  const selectedKeys = [...new Set(input.selectedKeys)].filter((key) => {
    const row = byKey.get(key);
    return row && (!row.disabled || row.assigned);
  });

  const diff = computeCatalogAssignDiff({ selectedKeys, liveAssignments });
  const catalog = await input.client.catalogLogDefinition.findUnique({
    where: { id: view.catalogDefinitionId },
    select: {
      id: true,
      recommendedCadence: true,
      recommendedScheduleKind: true,
      recommendedDaypartLabels: true,
    },
  });
  if (!catalog) throw new Error("Published Catalog Log not found.");

  const cycleCache = new Map<string, { keys: string[]; labelByKey: Map<string, string> }>();
  async function timingFor(departmentId: string): Promise<ResolvedAttachTiming> {
    let cached = cycleCache.get(departmentId);
    if (!cached) {
      const options = await loadCycleOptionsForDepartment(
        input.client,
        input.facilityId,
        departmentId,
        input.now,
      );
      cached = { keys: options.map((o) => o.stableKey), labelByKey: cycleLabelMap(options) };
      cycleCache.set(departmentId, cached);
    }
    return resolveAttachTimingProposal({
      recommendedCadence: catalog!.recommendedCadence ?? "AD_HOC",
      recommendedScheduleKind: catalog!.recommendedScheduleKind,
      recommendedDaypartLabels: catalog!.recommendedDaypartLabels,
      publishedCycleStableKeys: cached.keys,
      cycleLabelByKey: cached.labelByKey,
    });
  }

  await input.client.$transaction(async (tx) => {
    const db = tx as unknown as PrismaClient;
    for (const { attachmentId } of diff.remove) {
      await setLogAttachmentStatus(db, {
        facilityId: input.facilityId,
        attachmentId,
        status: "RETIRED",
        now: input.now,
      });
    }
    for (const key of diff.addKeys) {
      const row = byKey.get(key);
      if (!row?.departmentId) continue;
      if (row.kind === "OPERATIONAL_TYPE") continue;
      const timing = await timingFor(row.departmentId);
      if (timing.needsSetup) continue;
      const target =
        row.kind === "ASSET"
          ? { kind: "ASSET" as const, assetId: row.id }
          : row.kind === "SPACE"
            ? { kind: "SPACE" as const, spaceId: row.id }
            : row.kind === "UNIT"
              ? { kind: "UNIT" as const, unitId: row.id }
              : { kind: "DEPARTMENT" as const, targetDepartmentId: row.id };
      await createLogAttachment(db, {
        facilityId: input.facilityId,
        departmentId: row.departmentId,
        catalogDefinitionId: view.catalogDefinitionId,
        target,
        timingMode: timing.timingMode,
        dailyWindows: timing.dailyWindows,
        cycleStableKeys: timing.cycleStableKeys,
        calendarCadence: timing.calendarCadence,
        calendarDaysOfWeek: timing.calendarDaysOfWeek,
        calendarDayOfMonth: timing.calendarDayOfMonth,
        calendarDueTimeLocal: timing.calendarDueTimeLocal,
        allowAdHoc: timing.allowAdHoc,
        effectiveFromKey: view.effectiveFromKey,
      });
    }
  });

  return {
    added: diff.addKeys.length,
    removed: diff.remove.length,
    skipped: input.selectedKeys.length - selectedKeys.length,
  };
}
