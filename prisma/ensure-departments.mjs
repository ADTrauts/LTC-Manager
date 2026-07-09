/**
 * Shared by prisma/seed.mjs and scripts/provision-facility.mjs
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} facilityId
 */
export async function upsertDefaultDepartments(prisma, facilityId) {
  const departmentDefs = [
    { key: "DIETARY", name: "Dietary", sortOrder: 10 },
    { key: "EVS", name: "Environmental Services", sortOrder: 20 },
    { key: "PLANT", name: "Plant Operations", sortOrder: 30 },
  ];
  /** @type {Record<string, string>} */
  const departmentIds = {};
  for (const d of departmentDefs) {
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
    departmentIds[row.key] = row.id;
  }
  return {
    DIETARY: departmentIds.DIETARY,
    EVS: departmentIds.EVS,
    PLANT: departmentIds.PLANT,
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} facilityId
 * @param {{ DIETARY: string; EVS: string; PLANT: string }} deptIds
 */
export async function backfillUnitDepartmentRows(prisma, facilityId, deptIds) {
  const dietaryTypes = new Set(["SERVERY", "KITCHEN", "RETAIL"]);
  const evsTypes = new Set([
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
  ]);
  const plantTypes = new Set(["MECHANICAL"]);

  const units = await prisma.unit.findMany({
    where: { facilityId },
    select: { id: true, unitType: true },
  });

  for (const unit of units) {
    if (dietaryTypes.has(unit.unitType)) {
      await prisma.unitDepartmentResponsibility.upsert({
        where: { unitId_departmentId: { unitId: unit.id, departmentId: deptIds.DIETARY } },
        update: { kind: "PRIMARY" },
        create: { unitId: unit.id, departmentId: deptIds.DIETARY, kind: "PRIMARY" },
      });
    }
    if (evsTypes.has(unit.unitType)) {
      await prisma.unitDepartmentResponsibility.upsert({
        where: { unitId_departmentId: { unitId: unit.id, departmentId: deptIds.EVS } },
        update: { kind: "PRIMARY" },
        create: { unitId: unit.id, departmentId: deptIds.EVS, kind: "PRIMARY" },
      });
    }
    if (plantTypes.has(unit.unitType)) {
      await prisma.unitDepartmentResponsibility.upsert({
        where: { unitId_departmentId: { unitId: unit.id, departmentId: deptIds.PLANT } },
        update: { kind: "PRIMARY" },
        create: { unitId: unit.id, departmentId: deptIds.PLANT, kind: "PRIMARY" },
      });
    }
  }
}
