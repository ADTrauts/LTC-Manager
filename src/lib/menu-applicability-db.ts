import type { Prisma, PrismaClient } from "@prisma/client";

import {
  collectDepartmentActionableLocations,
  groupLocationsByPhysicalHierarchy,
  type DepartmentActionableLocation,
  type DepartmentLocationFloorGroup,
} from "@/lib/department-administration";
import { loadDepartmentLocationsView } from "@/lib/department-administration/load-department-admin";
import type { FacilityVocabulary } from "@/lib/facility-builder/facility-vocabulary";
import { loadFacilityHierarchy } from "@/lib/facility-builder/load-facility-hierarchy";
import {
  normalizeMenuLocationTarget,
  selectEligibleMenuCycleIdentities,
  validateMenuCycleAssignments,
  validateMenuLocationAssignments,
  type EligibleMenuOperationalCycle,
  type MenuApplicabilityRecord,
  type MenuCycleAssignment,
  type MenuLocationTarget,
  type MenuOverlapPeer,
} from "@/lib/menu-applicability";
import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Prisma.TransactionClient;

async function loadRoomPatternBySpaceId(input: {
  client: DbClient;
  facilityId: string;
  departmentId: string;
}) {
  const active = await input.client.departmentOperationalProfile.findFirst({
    where: { facilityId: input.facilityId, departmentId: input.departmentId, status: "ACTIVE" },
    select: { id: true },
  });
  const profile =
    active ??
    (await input.client.departmentOperationalProfile.findFirst({
      where: { facilityId: input.facilityId, departmentId: input.departmentId, status: "DRAFT" },
      orderBy: { version: "desc" },
      select: { id: true },
    }));
  const map = new Map<
    string,
    {
      archetypeKey: string;
      archetypeName: string;
      exceptionCount: number;
      recommendedPatternKey: string | null;
      spaceTypeLabel: string;
      displayName: string;
    }
  >();
  if (!profile) return map;

  const bindings = await input.client.departmentRoomArchetypeBinding.findMany({
    where: { profileId: profile.id },
    select: {
      unitSpaceId: true,
      unitSpace: { select: { name: true } },
      archetype: { select: { key: true, name: true } },
    },
  });
  for (const binding of bindings) {
    map.set(binding.unitSpaceId, {
      archetypeKey: binding.archetype.key,
      archetypeName: binding.archetype.name,
      exceptionCount: 0,
      recommendedPatternKey: null,
      spaceTypeLabel: "",
      displayName: binding.unitSpace.name,
    });
  }
  return map;
}

export async function loadDepartmentMenuLocations(input: {
  facilityId: string;
  departmentId: string;
  client?: DbClient;
}): Promise<{
  locations: DepartmentActionableLocation[];
  locationHierarchy: DepartmentLocationFloorGroup[];
  vocabulary: FacilityVocabulary;
} | null> {
  const client = input.client ?? prisma;
  const view = await loadDepartmentLocationsView({
    facilityId: input.facilityId,
    departmentId: input.departmentId,
  });
  if (!view) return null;

  const roomPatternBySpaceId = await loadRoomPatternBySpaceId({
    client,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
  });
  const hierarchy = await loadFacilityHierarchy(input.facilityId);
  const locations = collectDepartmentActionableLocations({
    departmentId: input.departmentId,
    units: hierarchy.units,
    roomPatternBySpaceId,
  });
  return {
    locations,
    locationHierarchy: groupLocationsByPhysicalHierarchy(locations),
    vocabulary: view.vocabulary,
  };
}

export async function loadEligibleMenuOperationalCycles(input: {
  facilityId: string;
  departmentId: string;
  client?: DbClient;
}): Promise<EligibleMenuOperationalCycle[]> {
  const client = input.client ?? prisma;
  const rows = await client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      nodeKind: "PERIOD",
      parentStableKey: null,
      status: "PUBLISHED",
    },
    select: {
      stableKey: true,
      label: true,
      mealType: true,
      displaySequence: true,
      version: true,
      status: true,
      nodeKind: true,
      parentStableKey: true,
    },
    orderBy: [{ displaySequence: "asc" }, { version: "desc" }],
  });
  return selectEligibleMenuCycleIdentities(rows);
}

export async function loadMenuApplicability(
  client: DbClient,
  menuId: string,
): Promise<MenuApplicabilityRecord> {
  const [locations, cycles] = await Promise.all([
    client.menuLocationApplicability.findMany({
      where: { menuId },
      select: { unitId: true, spaceId: true },
      orderBy: { createdAt: "asc" },
    }),
    client.menuOperationalCycleApplicability.findMany({
      where: { menuId },
      select: { cycleStableKey: true, menuPeriodKey: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    locations: locations.map((row) => normalizeMenuLocationTarget(row)),
    cycles,
  };
}

export async function loadMenuApplicabilityPeers(
  client: DbClient,
  input: { facilityId: string; departmentId: string; excludeMenuId?: string },
): Promise<MenuOverlapPeer[]> {
  const menus = await client.menu.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "ACTIVE",
      ...(input.excludeMenuId ? { id: { not: input.excludeMenuId } } : {}),
    },
    select: {
      id: true,
      name: true,
      status: true,
      locationApplicability: { select: { unitId: true, spaceId: true } },
      operationalCycleApplicability: { select: { cycleStableKey: true, menuPeriodKey: true } },
    },
  });
  return menus.map((menu) => ({
    id: menu.id,
    name: menu.name,
    status: menu.status,
    locations: menu.locationApplicability.map((row) => normalizeMenuLocationTarget(row)),
    cycles: menu.operationalCycleApplicability,
  }));
}

export async function replaceMenuApplicability(input: {
  menuId: string;
  locations: readonly MenuLocationTarget[];
  cycles: readonly MenuCycleAssignment[];
  existing: MenuApplicabilityRecord;
  actionable: readonly DepartmentActionableLocation[];
  eligible: readonly EligibleMenuOperationalCycle[];
  periodKeys: readonly string[];
  client?: PrismaClient;
}): Promise<MenuApplicabilityRecord> {
  const locations = validateMenuLocationAssignments({
    next: input.locations,
    existing: input.existing.locations,
    actionable: input.actionable,
  });
  const cycles = validateMenuCycleAssignments({
    next: input.cycles,
    existing: input.existing.cycles,
    eligible: input.eligible,
    periodKeys: input.periodKeys,
  });

  const client = input.client ?? prisma;
  await client.$transaction(async (tx) => {
    await tx.menuLocationApplicability.deleteMany({ where: { menuId: input.menuId } });
    await tx.menuOperationalCycleApplicability.deleteMany({ where: { menuId: input.menuId } });
    if (locations.length > 0) {
      await tx.menuLocationApplicability.createMany({
        data: locations.map((row) => ({
          menuId: input.menuId,
          unitId: row.unitId,
          spaceId: row.spaceId,
        })),
      });
    }
    if (cycles.length > 0) {
      await tx.menuOperationalCycleApplicability.createMany({
        data: cycles.map((row) => ({
          menuId: input.menuId,
          cycleStableKey: row.cycleStableKey,
          menuPeriodKey: row.menuPeriodKey,
        })),
      });
    }
  });

  return { locations, cycles };
}
