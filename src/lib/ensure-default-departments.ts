import type { Prisma } from "@prisma/client";
import { PrismaClient, type UnitType } from "@prisma/client";

import {
  getDepartmentProduct,
  installDepartmentProductForInternalDevelopment,
  type DepartmentProductKey,
} from "@/lib/department-products";

/**
 * Legacy bootstrap product set. New Vssyl Department Products must be
 * installed explicitly via `installDepartmentProduct` — adding a registry
 * entry must not auto-seed every facility.
 */
const BOOTSTRAP_DEPARTMENT_PRODUCT_KEYS = ["DIETARY", "EVS", "PLANT"] as const satisfies readonly DepartmentProductKey[];

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Ensures the original three Vssyl Department Products exist for a facility.
 * Routes through `installDepartmentProductForInternalDevelopment`. Idempotent.
 *
 * Customer application routes must not call this. CLI / seed / provision
 * may still bootstrap the original trio for local development.
 */
export async function ensureDefaultDepartments(prisma: DbClient, facilityId: string) {
  const out: Record<string, string> = {};
  for (const productKey of BOOTSTRAP_DEPARTMENT_PRODUCT_KEYS) {
    const product = getDepartmentProduct(productKey);
    if (!product) {
      throw new Error(`Bootstrap Department Product ${productKey} is missing from the registry.`);
    }
    const installed = await installDepartmentProductForInternalDevelopment({
      facilityId,
      productKey,
      prisma,
    });
    await prisma.department.update({
      where: { id: installed.id },
      data: {
        name: product.name,
        sortOrder: product.sortOrder,
        isActive: true,
      },
    });
    out[productKey] = installed.id;
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
export async function loadInstalledBootstrapDepartmentIds(
  prisma: DbClient,
  facilityId: string,
): Promise<{ DIETARY?: string; EVS?: string; PLANT?: string }> {
  const rows = await prisma.department.findMany({
    where: { facilityId, key: { in: [...BOOTSTRAP_DEPARTMENT_PRODUCT_KEYS] } },
    select: { id: true, key: true },
  });
  const out: { DIETARY?: string; EVS?: string; PLANT?: string } = {};
  for (const row of rows) {
    if (row.key === "DIETARY" || row.key === "EVS" || row.key === "PLANT") {
      out[row.key] = row.id;
    }
  }
  return out;
}

export async function backfillUnitDepartmentResponsibilities(
  prisma: DbClient,
  facilityId: string,
  deptIds: { DIETARY?: string; EVS?: string; PLANT?: string },
) {
  const units = await prisma.unit.findMany({
    where: { facilityId },
    select: { id: true, unitType: true },
  });

  for (const unit of units) {
    const dietary = DIETARY_UNIT_TYPES.includes(unit.unitType);
    const evs = EVS_UNIT_TYPES.includes(unit.unitType);
    const plant = PLANT_UNIT_TYPES.includes(unit.unitType);

    if (dietary && deptIds.DIETARY) {
      await prisma.unitDepartmentResponsibility.upsert({
        where: { unitId_departmentId: { unitId: unit.id, departmentId: deptIds.DIETARY } },
        update: { kind: "PRIMARY" },
        create: { unitId: unit.id, departmentId: deptIds.DIETARY, kind: "PRIMARY" },
      });
    }
    if (evs && deptIds.EVS) {
      await prisma.unitDepartmentResponsibility.upsert({
        where: { unitId_departmentId: { unitId: unit.id, departmentId: deptIds.EVS } },
        update: { kind: "PRIMARY" },
        create: { unitId: unit.id, departmentId: deptIds.EVS, kind: "PRIMARY" },
      });
    }
    if (plant && deptIds.PLANT) {
      await prisma.unitDepartmentResponsibility.upsert({
        where: { unitId_departmentId: { unitId: unit.id, departmentId: deptIds.PLANT } },
        update: { kind: "PRIMARY" },
        create: { unitId: unit.id, departmentId: deptIds.PLANT, kind: "PRIMARY" },
      });
    }
  }
}
