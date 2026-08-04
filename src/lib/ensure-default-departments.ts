import type { Prisma } from "@prisma/client";
import { PrismaClient, type UnitType } from "@prisma/client";

const DEFAULT_DEPTS: Array<{ key: string; name: string; sortOrder: number }> = [
  { key: "DIETARY", name: "Dietary", sortOrder: 10 },
  { key: "EVS", name: "Environmental Services", sortOrder: 20 },
  { key: "PLANT", name: "Plant Operations", sortOrder: 30 },
];

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Ensures the three standard departments exist for a facility. Idempotent.
 */
export async function ensureDefaultDepartments(prisma: DbClient, facilityId: string) {
  const out: Record<string, string> = {};
  for (const d of DEFAULT_DEPTS) {
    const row = await prisma.department.upsert({
      where: { facilityId_key: { facilityId, key: d.key } },
      update: { name: d.name, sortOrder: d.sortOrder, isActive: true },
      create: {
        facilityId,
        key: d.key,
        name: d.name,
        sortOrder: d.sortOrder,
        isActive: true,
        showInEmployeeApp: true,
      },
      select: { id: true, key: true },
    });
    out[row.key] = row.id;
  }
  return out as { DIETARY: string; EVS: string; PLANT: string };
}

const DIETARY_UNIT_TYPES: UnitType[] = ["SERVERY", "KITCHEN", "RETAIL"];
const EVS_UNIT_TYPES: UnitType[] = [
  "OFFICE",
  "STORAGE",
  "OTHER",
  "RESIDENT_AREA",
  "COMMON_AREA",
  "RESTROOM_CLUSTER",
  "EVS_ZONE",
  "GROUND",
  "SERVERY",
  "RETAIL",
  "KITCHEN",
];
const PLANT_UNIT_TYPES: UnitType[] = ["MECHANICAL"];

/**
 * Backfill `UnitDepartmentResponsibility` for units missing rows. Safe to call multiple times.
 */
export async function backfillUnitDepartmentResponsibilities(
  prisma: DbClient,
  facilityId: string,
  deptIds: { DIETARY: string; EVS: string; PLANT: string },
) {
  const units = await prisma.unit.findMany({
    where: { facilityId },
    select: { id: true, unitType: true },
  });

  for (const unit of units) {
    const dietary = DIETARY_UNIT_TYPES.includes(unit.unitType);
    const evs = EVS_UNIT_TYPES.includes(unit.unitType);
    const plant = PLANT_UNIT_TYPES.includes(unit.unitType);

    if (dietary) {
      await prisma.unitDepartmentResponsibility.upsert({
        where: { unitId_departmentId: { unitId: unit.id, departmentId: deptIds.DIETARY } },
        update: { kind: "PRIMARY" },
        create: { unitId: unit.id, departmentId: deptIds.DIETARY, kind: "PRIMARY" },
      });
    }
    if (evs) {
      await prisma.unitDepartmentResponsibility.upsert({
        where: { unitId_departmentId: { unitId: unit.id, departmentId: deptIds.EVS } },
        update: { kind: "PRIMARY" },
        create: { unitId: unit.id, departmentId: deptIds.EVS, kind: "PRIMARY" },
      });
    }
    if (plant) {
      await prisma.unitDepartmentResponsibility.upsert({
        where: { unitId_departmentId: { unitId: unit.id, departmentId: deptIds.PLANT } },
        update: { kind: "PRIMARY" },
        create: { unitId: unit.id, departmentId: deptIds.PLANT, kind: "PRIMARY" },
      });
    }
  }
}
