/**
 * Menu Runtime persistence — narrow Prisma reads for resolveApplicableMenus.
 *
 * Does not own resolution semantics. Does not use the /logs compatibility loader.
 */

import { isActionableDepartmentUnit } from "@/lib/department-administration";
import { departmentProductOffersMenus } from "@/lib/department-products";
import { resolveBuilderNodeDisplayKind } from "@/lib/facility-builder/builder-display";
import { normalizeMenuLocationTarget, type MenuLocationTarget } from "@/lib/menu-applicability";
import {
  assertResolveApplicableMenusInput,
  cycleOccursAtMenuLocation,
  MenuRuntimeRequestError,
  normalizeRequestedCycleToRootPeriod,
  resolveApplicableMenusFromFacts,
  type MenuResolutionResult,
  type MenuRuntimeCandidateFact,
  type MenuRuntimeItemFact,
  type ResolveApplicableMenusInput,
} from "@/lib/menu-runtime";
import { loadPublishedCyclesForDate } from "@/lib/operational-cycles/load-published-cycles";
import { loadSpaceOperationalTypeAssignments } from "@/lib/operational-cycles/load-operational-type-targets";
import type { CycleUnitScope } from "@/lib/operational-cycles/types";
import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

type LocationActionability = {
  exists: boolean;
  facilityId: string | null;
  actionable: boolean;
};

async function loadDepartmentInFacility(input: {
  facilityId: string;
  departmentId: string;
}): Promise<void> {
  const department = await prisma.department.findFirst({
    where: { id: input.departmentId },
    select: { id: true, facilityId: true },
  });
  if (!department) {
    throw new MenuRuntimeRequestError("INVALID_DEPARTMENT", "Menu Runtime Department was not found.");
  }
  if (department.facilityId !== input.facilityId) {
    throw new MenuRuntimeRequestError(
      "CROSS_FACILITY_TARGET",
      "Menu Runtime Department is outside the requested Facility.",
    );
  }
}

async function loadLocationActionability(input: {
  facilityId: string;
  departmentId: string;
  location: MenuLocationTarget;
}): Promise<LocationActionability> {
  if (input.location.spaceId) {
    const space = await prisma.unitSpace.findFirst({
      where: { id: input.location.spaceId },
      select: {
        id: true,
        facilityId: true,
        isActive: true,
        unit: { select: { hierarchyRole: true, parentUnitId: true } },
        responsibilities: {
          where: { departmentId: input.departmentId },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!space) return { exists: false, facilityId: null, actionable: false };
    const parentKind = space.unit
      ? resolveBuilderNodeDisplayKind({
          hierarchyRole: space.unit.hierarchyRole,
          parentUnitId: space.unit.parentUnitId,
        })
      : null;
    const actionable =
      space.facilityId === input.facilityId &&
      space.isActive &&
      space.responsibilities.length > 0 &&
      parentKind !== "staged";
    return { exists: true, facilityId: space.facilityId, actionable };
  }

  const unit = await prisma.unit.findFirst({
    where: { id: input.location.unitId! },
    select: {
      id: true,
      facilityId: true,
      isActive: true,
      hierarchyRole: true,
      parentUnitId: true,
      departmentResponsibilities: {
        where: { departmentId: input.departmentId },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!unit) return { exists: false, facilityId: null, actionable: false };
  const actionable =
    unit.facilityId === input.facilityId &&
    unit.isActive &&
    unit.departmentResponsibilities.length > 0 &&
    isActionableDepartmentUnit({
      hierarchyRole: unit.hierarchyRole,
      parentUnitId: unit.parentUnitId,
    });
  return { exists: true, facilityId: unit.facilityId, actionable };
}

async function loadUnitCycleScope(unitId: string): Promise<CycleUnitScope | null> {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, isActive: true },
    select: {
      id: true,
      unitType: true,
      childSpaces: { where: { isActive: true }, select: { id: true } },
    },
  });
  if (!unit) return null;
  return {
    id: unit.id,
    unitType: unit.unitType,
    spaceIds: unit.childSpaces.map((space) => space.id),
  };
}

async function loadOperationalTypeKey(input: {
  facilityId: string;
  departmentId: string;
  spaceId: string;
  provided?: string | null;
}): Promise<string | null> {
  if (input.provided !== undefined) return input.provided;
  const assignments = await loadSpaceOperationalTypeAssignments({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    spaceIds: [input.spaceId],
    perspective: "runtime",
  });
  return assignments.get(input.spaceId)?.key ?? null;
}

export async function loadMenuRuntimeCandidates(input: {
  facilityId: string;
  departmentId: string;
  location: MenuLocationTarget;
  cycleStableKey: string;
}): Promise<MenuRuntimeCandidateFact[]> {
  const locationWhere = input.location.spaceId
    ? { spaceId: input.location.spaceId, unitId: null }
    : { unitId: input.location.unitId, spaceId: null };

  const rows = await prisma.menu.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "ACTIVE",
      locationApplicability: { some: locationWhere },
      operationalCycleApplicability: { some: { cycleStableKey: input.cycleStableKey } },
    },
    select: {
      id: true,
      name: true,
      departmentId: true,
      facilityId: true,
      status: true,
      cycleSettings: {
        select: {
          cycleLengthWeeks: true,
          weekStartsOn: true,
          cycleAnchorDate: true,
          periodConfigJson: true,
        },
      },
      locationApplicability: {
        where: locationWhere,
        select: { unitId: true, spaceId: true },
        take: 1,
      },
      operationalCycleApplicability: {
        where: { cycleStableKey: input.cycleStableKey },
        select: { cycleStableKey: true, menuPeriodKey: true },
        take: 1,
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  return rows.flatMap((row) => {
    const locationRow = row.locationApplicability[0];
    const cycleRow = row.operationalCycleApplicability[0];
    if (!locationRow || !cycleRow) return [];
    return [
      {
        menuId: row.id,
        menuName: row.name,
        departmentId: row.departmentId,
        facilityId: row.facilityId,
        status: row.status,
        location: normalizeMenuLocationTarget(locationRow),
        cycleStableKey: cycleRow.cycleStableKey,
        menuPeriodKey: cycleRow.menuPeriodKey,
        cycleSettings: row.cycleSettings
          ? {
              cycleLengthWeeks: row.cycleSettings.cycleLengthWeeks,
              weekStartsOn: row.cycleSettings.weekStartsOn,
              cycleAnchorDate: row.cycleSettings.cycleAnchorDate,
              periodConfigJson: row.cycleSettings.periodConfigJson,
            }
          : null,
      },
    ];
  });
}

export async function loadMenuRuntimeSlotItems(
  slots: Array<{
    menuId: string;
    weekNumber: number;
    dayIndex: number;
    menuPeriodKey: string;
  }>,
): Promise<MenuRuntimeItemFact[]> {
  if (slots.length === 0) return [];
  const rows = await prisma.menuItem.findMany({
    where: {
      OR: slots.map((slot) => ({
        menuId: slot.menuId,
        weekNumber: slot.weekNumber,
        dayIndex: slot.dayIndex,
        mealPeriodKey: slot.menuPeriodKey,
      })),
    },
    select: {
      id: true,
      menuId: true,
      weekNumber: true,
      dayIndex: true,
      mealPeriodKey: true,
      category: true,
      itemName: true,
      portionValue: true,
      portionUnit: true,
      entryType: true,
      displayOrder: true,
    },
    orderBy: [{ displayOrder: "asc" }, { itemName: "asc" }],
  });
  return rows.filter((row): row is MenuRuntimeItemFact => Boolean(row.menuId));
}

/**
 * Canonical Runtime Menu API.
 * Validates the request, confirms location + Cycle occurrence, then resolves
 * ACTIVE Menu applicability for the exact location and root PERIOD.
 */
export async function resolveApplicableMenus(
  input: ResolveApplicableMenusInput,
): Promise<MenuResolutionResult> {
  const request = assertResolveApplicableMenusInput(input);
  await loadDepartmentInFacility(request);

  const locationState = await loadLocationActionability(request);
  if (locationState.exists && locationState.facilityId && locationState.facilityId !== request.facilityId) {
    throw new MenuRuntimeRequestError(
      "CROSS_FACILITY_TARGET",
      "Menu Runtime location is outside the requested Facility.",
    );
  }

  const publishedCycles = await loadPublishedCyclesForDate(
    request.facilityId,
    request.departmentId,
    request.serviceDateKey,
  );
  const operationalTypeKey = request.location.spaceId
    ? await loadOperationalTypeKey({
        facilityId: request.facilityId,
        departmentId: request.departmentId,
        spaceId: request.location.spaceId,
        provided: input.operationalTypeKey,
      })
    : (input.operationalTypeKey ?? null);
  const unitCycleScope = request.location.unitId ? await loadUnitCycleScope(request.location.unitId) : null;

  const emptyFacts = {
    ...request,
    operationalTypeKey,
    locationActionable: locationState.actionable,
    publishedCycles,
    candidates: [] as MenuRuntimeCandidateFact[],
    items: [] as MenuRuntimeItemFact[],
    unitCycleScope,
  };

  if (!locationState.actionable) {
    return resolveApplicableMenusFromFacts(emptyFacts);
  }

  const normalized = normalizeRequestedCycleToRootPeriod(request.cycleStableKey, publishedCycles);
  if (
    !normalized ||
    !cycleOccursAtMenuLocation({
      root: normalized.root,
      published: publishedCycles,
      location: request.location,
      serviceDateKey: request.serviceDateKey,
      operationalTypeKey,
      unitCycleScope,
    })
  ) {
    return resolveApplicableMenusFromFacts(emptyFacts);
  }

  const candidates = await loadMenuRuntimeCandidates({
    facilityId: request.facilityId,
    departmentId: request.departmentId,
    location: request.location,
    cycleStableKey: normalized.root.stableKey,
  });

  const slotted = resolveApplicableMenusFromFacts({
    ...emptyFacts,
    locationActionable: true,
    candidates,
  });
  const slots = slotted.matches.flatMap((menu) =>
    menu.weekNumber !== null && menu.dayIndex !== null && menu.menuPeriodKey
      ? [
          {
            menuId: menu.menuId,
            weekNumber: menu.weekNumber,
            dayIndex: menu.dayIndex,
            menuPeriodKey: menu.menuPeriodKey,
          },
        ]
      : [],
  );

  return resolveApplicableMenusFromFacts({
    ...emptyFacts,
    locationActionable: true,
    candidates,
    items: await loadMenuRuntimeSlotItems(slots),
  });
}

/**
 * Today-only batched ACTIVE Menu facts for Review composition.
 * Past dates return empty — Review marks the domain unavailable instead.
 */
export async function loadReviewMenuFacts(input: {
  client?: PrismaClient | Prisma.TransactionClient;
  facilityId: string;
  departments: ReadonlyArray<{ id: string; key: string }>;
  serviceDate: string;
  todayKey: string;
}): Promise<{
  menuDepartmentIds: string[];
  menuCandidates: MenuRuntimeCandidateFact[];
  menuItems: MenuRuntimeItemFact[];
}> {
  if (input.serviceDate !== input.todayKey) {
    return { menuDepartmentIds: [], menuCandidates: [], menuItems: [] };
  }
  const menuDepartmentIds = input.departments
    .filter((department) => departmentProductOffersMenus(department.key))
    .map((department) => department.id);
  if (menuDepartmentIds.length === 0) {
    return { menuDepartmentIds: [], menuCandidates: [], menuItems: [] };
  }

  const db = input.client ?? prisma;
  const rows = await db.menu.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: { in: menuDepartmentIds },
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      departmentId: true,
      facilityId: true,
      status: true,
      cycleSettings: {
        select: {
          cycleLengthWeeks: true,
          weekStartsOn: true,
          cycleAnchorDate: true,
          periodConfigJson: true,
        },
      },
      locationApplicability: { select: { unitId: true, spaceId: true } },
      operationalCycleApplicability: { select: { cycleStableKey: true, menuPeriodKey: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const menuCandidates: MenuRuntimeCandidateFact[] = [];
  for (const row of rows) {
    const settings = row.cycleSettings
      ? {
          cycleLengthWeeks: row.cycleSettings.cycleLengthWeeks,
          weekStartsOn: row.cycleSettings.weekStartsOn,
          cycleAnchorDate: row.cycleSettings.cycleAnchorDate,
          periodConfigJson: row.cycleSettings.periodConfigJson,
        }
      : null;
    for (const locationRow of row.locationApplicability) {
      let location;
      try {
        location = normalizeMenuLocationTarget(locationRow);
      } catch {
        continue;
      }
      for (const cycleRow of row.operationalCycleApplicability) {
        menuCandidates.push({
          menuId: row.id,
          menuName: row.name,
          departmentId: row.departmentId,
          facilityId: row.facilityId,
          status: row.status,
          location,
          cycleStableKey: cycleRow.cycleStableKey,
          menuPeriodKey: cycleRow.menuPeriodKey,
          cycleSettings: settings,
        });
      }
    }
  }

  const menuIds = rows.map((row) => row.id);
  const itemRows =
    menuIds.length === 0
      ? []
      : await db.menuItem.findMany({
          where: { menuId: { in: menuIds } },
          select: {
            id: true,
            menuId: true,
            weekNumber: true,
            dayIndex: true,
            mealPeriodKey: true,
            category: true,
            itemName: true,
            portionValue: true,
            portionUnit: true,
            entryType: true,
            displayOrder: true,
          },
          orderBy: [{ displayOrder: "asc" }, { itemName: "asc" }],
        });

  return {
    menuDepartmentIds,
    menuCandidates,
    menuItems: itemRows.filter((row): row is MenuRuntimeItemFact => Boolean(row.menuId)),
  };
}
