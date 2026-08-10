/**
 * Transactional Facility Structure import executor.
 * Creates FLOOR → NEIGHBORHOOD → UnitSpace in parent-before-child order.
 */

import { UnitHierarchyRole } from "@prisma/client";
import type { Prisma, PrismaClient } from "@prisma/client";

import {
  FLOOR_INTERNAL_UNIT_TYPE,
  NEIGHBORHOOD_INTERNAL_UNIT_TYPE,
} from "@/lib/facility-builder/builder-display";
import {
  nextAppendDisplayOrder,
  nextAppendSortOrder,
} from "@/lib/facility-builder/builder-setup";

import {
  finalizeFacilityPlanConfirmability,
  orderedFacilityCreatePlan,
  planFacilityStructureImport,
  parseFacilityStructureCsv,
  type FacilityStructureCatalog,
  type FacilityStructureImportPlan,
} from "./facility-structure";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function loadFacilityStructureCatalog(
  client: DbClient,
  facilityId: string,
): Promise<FacilityStructureCatalog> {
  const [units, spaces, departments] = await Promise.all([
    client.unit.findMany({
      where: { facilityId },
      select: {
        id: true,
        name: true,
        hierarchyRole: true,
        parentUnitId: true,
        isActive: true,
        displayOrder: true,
        description: true,
      },
    }),
    client.unitSpace.findMany({
      where: { facilityId },
      select: {
        id: true,
        unitId: true,
        name: true,
        spaceType: true,
        customTypeLabel: true,
        roomNumber: true,
        code: true,
        description: true,
        isActive: true,
        sortOrder: true,
      },
    }),
    client.department.findMany({
      where: { facilityId },
      select: { id: true, name: true, key: true, isActive: true },
    }),
  ]);
  return { units, spaces, departments };
}

export function buildFacilityStructurePlanFromCsv(
  text: string,
  catalog: FacilityStructureCatalog,
  fileName: string | null,
): { ok: true; plan: FacilityStructureImportPlan } | { ok: false; error: string } {
  const parsed = parseFacilityStructureCsv(text, fileName);
  if (!parsed.ok) return parsed;
  const plan = finalizeFacilityPlanConfirmability(
    planFacilityStructureImport(parsed.rows, catalog, parsed.fileName),
  );
  return { ok: true, plan };
}

export type FacilityStructureExecuteResult = {
  floorsCreated: number;
  neighborhoodsCreated: number;
  spacesCreated: number;
  responsibilitiesCreated: number;
  floorsReused: number;
  neighborhoodsReused: number;
  spacesReused: number;
};

/**
 * Execute a validated create-only plan inside a single transaction.
 * Re-checks uniqueness at write time for idempotent replay safety.
 */
export async function executeFacilityStructurePlan(
  client: PrismaClient,
  facilityId: string,
  plan: FacilityStructureImportPlan,
): Promise<FacilityStructureExecuteResult> {
  if (!plan.canConfirm || plan.counts.invalidRows > 0) {
    throw new Error("Import plan has validation errors and cannot be confirmed.");
  }

  const ops = orderedFacilityCreatePlan(plan);

  return client.$transaction(async (tx) => {
    const catalog = await loadFacilityStructureCatalog(tx, facilityId);
    const floorIdByKey = new Map<string, string>();
    const neighborhoodIdByKey = new Map<string, string>();

    // Seed maps with existing (reuse) ids from plan rows
    for (const row of plan.rows) {
      if (row.existingFloorId) floorIdByKey.set(row.floorKey, row.existingFloorId);
      if (row.existingNeighborhoodId) {
        neighborhoodIdByKey.set(row.neighborhoodKey, row.existingNeighborhoodId);
      }
    }

    let floorsCreated = 0;
    let neighborhoodsCreated = 0;
    let spacesCreated = 0;
    let responsibilitiesCreated = 0;

    const topLevel = catalog.units.filter((u) => u.parentUnitId === null);
    let nextFloorOrder = nextAppendDisplayOrder(
      topLevel.map((u) => ({ displayOrder: u.displayOrder })),
    );

    for (const floor of ops.floors) {
      const existing = catalog.units.find(
        (u) =>
          u.name.toLowerCase() === floor.name.toLowerCase() &&
          u.hierarchyRole === UnitHierarchyRole.FLOOR,
      );
      if (existing) {
        floorIdByKey.set(floor.key, existing.id);
        continue;
      }
      const created = await tx.unit.create({
        data: {
          facilityId,
          name: floor.name,
          unitType: FLOOR_INTERNAL_UNIT_TYPE,
          hierarchyRole: UnitHierarchyRole.FLOOR,
          parentUnitId: null,
          displayOrder: nextFloorOrder,
          isActive: true,
        },
        select: { id: true },
      });
      floorIdByKey.set(floor.key, created.id);
      floorsCreated += 1;
      nextFloorOrder = Math.min(9999, nextFloorOrder + 10);
    }

    for (const nbh of ops.neighborhoods) {
      const floorId = floorIdByKey.get(nbh.floorKey);
      if (!floorId) {
        throw new Error(`Missing Floor for neighborhood "${nbh.name}".`);
      }
      const existing = catalog.units.find(
        (u) => u.name.toLowerCase() === nbh.name.toLowerCase(),
      );
      if (existing) {
        neighborhoodIdByKey.set(nbh.key, existing.id);
        continue;
      }
      const siblings = await tx.unit.findMany({
        where: { facilityId, parentUnitId: floorId },
        select: { displayOrder: true },
      });
      const displayOrder = nextAppendDisplayOrder(siblings);
      const created = await tx.unit.create({
        data: {
          facilityId,
          name: nbh.name,
          unitType: NEIGHBORHOOD_INTERNAL_UNIT_TYPE,
          hierarchyRole: UnitHierarchyRole.NEIGHBORHOOD,
          parentUnitId: floorId,
          displayOrder,
          isActive: true,
        },
        select: { id: true },
      });
      neighborhoodIdByKey.set(nbh.key, created.id);
      neighborhoodsCreated += 1;
    }

    for (const space of ops.spaces) {
      const unitId = neighborhoodIdByKey.get(space.neighborhoodKey);
      if (!unitId) {
        throw new Error(`Missing Neighborhood for space "${space.name}".`);
      }
      const existing = await tx.unitSpace.findFirst({
        where: { unitId, name: space.name },
        select: { id: true },
      });
      if (existing) continue;

      const siblings = await tx.unitSpace.findMany({
        where: { unitId },
        select: { sortOrder: true },
      });
      const sortOrder = nextAppendSortOrder(siblings);
      const created = await tx.unitSpace.create({
        data: {
          unitId,
          facilityId,
          name: space.name,
          spaceType: space.spaceType,
          customTypeLabel: space.customTypeLabel,
          roomNumber: space.roomNumber,
          code: space.code,
          description: space.description,
          sortOrder,
          isActive: true,
        },
        select: { id: true },
      });
      spacesCreated += 1;

      if (space.departmentId) {
        const existingResp = await tx.unitSpaceResponsibility.findFirst({
          where: { spaceId: created.id, departmentId: space.departmentId },
          select: { id: true },
        });
        if (!existingResp) {
          await tx.unitSpaceResponsibility.create({
            data: {
              spaceId: created.id,
              departmentId: space.departmentId,
              capabilities: [],
            },
          });
          responsibilitiesCreated += 1;
        }
      }
    }

    return {
      floorsCreated,
      neighborhoodsCreated,
      spacesCreated,
      responsibilitiesCreated,
      floorsReused: plan.floorsReused,
      neighborhoodsReused: plan.neighborhoodsReused,
      spacesReused: plan.spacesReused,
    };
  });
}
