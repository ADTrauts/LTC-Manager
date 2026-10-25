import bcrypt from "bcryptjs";
import {
  AssetStatus,
  EmploymentType,
  EmployeeStatus,
  PrismaClient,
  RepairPriority,
  RepairStatus,
  RoleKey,
  ShiftType,
  UnitType,
  WorkOrderKind,
} from "@prisma/client";

import { upsertPublishedCatalogSeeds } from "./apply-catalog-log-seeds.mjs";
import { installMatchedCatalogRecords } from "./apply-log-template-presets.mjs";
import { backfillUnitDepartmentRows, upsertDefaultDepartments } from "./ensure-departments.mjs";

const prisma = new PrismaClient();

/** Keep in sync with migration `20260329120000_phase_a_facility` default facility id. */
const SEED_FACILITY_ID = "cmfacseed0000000000000001";
/** Wave 11 seed Organization for Terrace View. */
const SEED_ORGANIZATION_ID = "cmorgseed0000000000000001";

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: SEED_ORGANIZATION_ID },
    update: {
      name: "Terrace View Organization",
      displayName: "Terrace View Organization",
      organizationType: "LONG_TERM_CARE",
      isActive: true,
    },
    create: {
      id: SEED_ORGANIZATION_ID,
      name: "Terrace View Organization",
      displayName: "Terrace View Organization",
      organizationType: "LONG_TERM_CARE",
      isActive: true,
    },
  });

  const facility = await prisma.facility.upsert({
    where: { id: SEED_FACILITY_ID },
    update: {
      displayName: "Terrace View Long Term Care",
      organizationId: organization.id,
    },
    create: {
      id: SEED_FACILITY_ID,
      displayName: "Terrace View Long Term Care",
      organizationId: organization.id,
    },
  });

  const departmentIds = await upsertDefaultDepartments(prisma, facility.id);

  const adminUserForDept = await prisma.user.findUnique({
    where: { email: "admin@terraceview.local" },
    select: { id: true, primaryDepartmentId: true },
  });
  if (adminUserForDept && !adminUserForDept.primaryDepartmentId && departmentIds.DIETARY) {
    await prisma.user.update({
      where: { id: adminUserForDept.id },
      data: { primaryDepartmentId: departmentIds.DIETARY },
    });
  }

  const roles = [
    {
      key: RoleKey.FACILITY_ADMINISTRATOR,
      name: "Facility Administrator",
    },
    { key: RoleKey.GM, name: "General Manager" },
    { key: RoleKey.MANAGER, name: "Department Manager" },
    { key: RoleKey.SUPERVISOR, name: "Supervisor" },
    { key: RoleKey.LEAD_TEAM_MEMBER, name: "Lead Team Member" },
    { key: RoleKey.STAFF, name: "Team Member" },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { key: role.key },
      update: { name: role.name, isActive: true },
      create: role,
    });
  }

  const faRole = await prisma.role.findUniqueOrThrow({
    where: { key: RoleKey.FACILITY_ADMINISTRATOR },
  });

  // Nonproduction demo password for the Terrace View seed admin only.
  // Never reuse outside local development. CI and verify:db must set SEED_DEMO_PASSWORD to a
  // synthetic value. In production-like environments the default is refused unless
  // ALLOW_DEMO_SEED_PASSWORD=1 is set explicitly.
  const demoPassword =
    process.env.SEED_DEMO_PASSWORD ||
    (process.env.ALLOW_DEMO_SEED_PASSWORD === "1" || process.env.NODE_ENV !== "production"
      ? "ChangeMeNow123!"
      : null);
  if (!demoPassword) {
    throw new Error(
      "Seed refuses the hardcoded demo password when NODE_ENV=production. Set SEED_DEMO_PASSWORD or ALLOW_DEMO_SEED_PASSWORD=1 for nonproduction seeding only.",
    );
  }
  const hash = await bcrypt.hash(demoPassword, 12);

  await prisma.user.upsert({
    where: { email: "admin@terraceview.local" },
    update: {
      displayName: "Terrace View Admin",
      facilityId: facility.id,
      roleId: faRole.id,
      passwordHash: hash,
      isActive: true,
      primaryDepartmentId: departmentIds.DIETARY,
    },
    create: {
      email: "admin@terraceview.local",
      displayName: "Terrace View Admin",
      facilityId: facility.id,
      roleId: faRole.id,
      passwordHash: hash,
      isActive: true,
      primaryDepartmentId: departmentIds.DIETARY,
    },
  });

  const starterUnits = [
    {
      name: "Central Kitchen",
      unitType: UnitType.KITCHEN,
      displayOrder: 10,
    },
    {
      name: "Retail",
      unitType: UnitType.RETAIL,
      displayOrder: 20,
    },
    {
      name: "1A Naval Park",
      unitType: UnitType.SERVERY,
      displayOrder: 30,
    },
  ];

  const unitIdByName = {};

  for (const unit of starterUnits) {
    // Root and child names have separate sibling scopes since optional Buildings.
    // Prisma cannot express the partial root unique index as an upsert selector.
    // Serialize this check/create on the Facility, preserving any same-named child.
    const savedUnit = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Facility" WHERE "id" = ${facility.id} FOR UPDATE`;
      const existing = await tx.unit.findFirst({
        where: { facilityId: facility.id, parentUnitId: null, name: unit.name },
        select: { id: true },
      });
      const data = { unitType: unit.unitType, displayOrder: unit.displayOrder };
      return existing
        ? tx.unit.update({ where: { id: existing.id }, data })
        : tx.unit.create({ data: { ...data, facilityId: facility.id, parentUnitId: null, name: unit.name } });
    });

    unitIdByName[unit.name] = savedUnit.id;
  }

  await backfillUnitDepartmentRows(prisma, facility.id, departmentIds);

  const jobTitleNames = ["Cook", "EVS Aide", "Supervisor", "Team Member"];
  const jobTitleByName = {};
  for (let i = 0; i < jobTitleNames.length; i += 1) {
    const name = jobTitleNames[i];
    const jt = await prisma.jobTitle.upsert({
      where: { facilityId_name: { facilityId: facility.id, name } },
      update: { isActive: true, sortOrder: (i + 1) * 10 },
      create: { facilityId: facility.id, name, sortOrder: (i + 1) * 10, isActive: true },
      select: { id: true, name: true },
    });
    jobTitleByName[name] = jt.id;
  }

  const existingWs = await prisma.workShift.findFirst({
    where: { facilityId: facility.id, name: "7a–3p EVS" },
    select: { id: true },
  });
  if (!existingWs) {
    await prisma.workShift.create({
      data: {
        facilityId: facility.id,
        departmentId: departmentIds.EVS,
        name: "7a–3p EVS",
        startLocal: "07:00",
        endLocal: "15:00",
        sortOrder: 10,
        isActive: true,
      },
    });
  }

  // Platform Catalog seeds, then the matched Food & Nutrition Records for this facility.
  await upsertPublishedCatalogSeeds(prisma);
  await installMatchedCatalogRecords(prisma, { facilityId: facility.id });

  const serveryId = unitIdByName["1A Naval Park"];

  const employees = [
    {
      firstName: "Jane",
      lastName: "Carter",
      roleType: RoleKey.STAFF,
      employmentType: EmploymentType.FULL_TIME,
      status: EmployeeStatus.ACTIVE,
      unitName: "1A Naval Park",
      jobTitleName: "Team Member",
      deptKey: "DIETARY",
    },
    {
      firstName: "Mike",
      lastName: "Nelson",
      roleType: RoleKey.SUPERVISOR,
      employmentType: EmploymentType.FULL_TIME,
      status: EmployeeStatus.ACTIVE,
      unitName: "Central Kitchen",
      jobTitleName: "Supervisor",
      deptKey: "DIETARY",
    },
    {
      firstName: "Tara",
      lastName: "Smith",
      roleType: RoleKey.STAFF,
      employmentType: EmploymentType.PART_TIME,
      status: EmployeeStatus.ACTIVE,
      unitName: "Retail",
      jobTitleName: "EVS Aide",
      deptKey: "EVS",
    },
  ];

  const sampleEmployeeIds = employees.map((item) =>
    `${item.firstName}-${item.lastName}`.toLowerCase().replace(/\s+/g, "-"),
  );

  await prisma.employeeDepartment.deleteMany({
    where: { employeeId: { in: sampleEmployeeIds } },
  });
  await prisma.scheduleEntry.deleteMany({
    where: { employeeId: { in: sampleEmployeeIds } },
  });
  await prisma.operationalAssignment.deleteMany({
    where: { employeeId: { in: sampleEmployeeIds } },
  });
  await prisma.defaultAssignment.deleteMany({
    where: { employeeId: { in: sampleEmployeeIds } },
  });
  await prisma.employeeUnitAccess.deleteMany({
    where: { employeeId: { in: sampleEmployeeIds } },
  });
  await prisma.employee.deleteMany({
    where: { id: { in: sampleEmployeeIds } },
  });

  const adminUser = await prisma.user.findUnique({
    where: { email: "admin@terraceview.local" },
    select: { id: true },
  });

  const evsWorkShift = await prisma.workShift.findFirst({
    where: { facilityId: facility.id, name: "7a–3p EVS" },
    select: { id: true },
  });

  for (const item of employees) {
    const employee = await prisma.employee.upsert({
      where: {
        id: `${item.firstName}-${item.lastName}`.toLowerCase().replace(/\s+/g, "-"),
      },
      update: {
        facilityId: facility.id,
        firstName: item.firstName,
        lastName: item.lastName,
        roleType: item.roleType,
        employmentType: item.employmentType,
        status: item.status,
        primaryDepartmentId: departmentIds[item.deptKey],
        jobTitleId: jobTitleByName[item.jobTitleName],
      },
      create: {
        id: `${item.firstName}-${item.lastName}`.toLowerCase().replace(/\s+/g, "-"),
        facilityId: facility.id,
        firstName: item.firstName,
        lastName: item.lastName,
        roleType: item.roleType,
        employmentType: item.employmentType,
        status: item.status,
        primaryDepartmentId: departmentIds[item.deptKey],
        jobTitleId: jobTitleByName[item.jobTitleName],
      },
    });

    const unitId = unitIdByName[item.unitName];
    if (!unitId) continue;

    await prisma.defaultAssignment.create({
      data: {
        employeeId: employee.id,
        unitId,
        roleType: item.roleType,
        isActive: true,
      },
    }).catch(() => undefined);

    // Phase D: demo PIN sidebar restriction — Jane is limited to one unit; others use all units.
    if (item.firstName === "Jane" && serveryId) {
      await prisma.employeeUnitAccess.deleteMany({ where: { employeeId: employee.id } });
      await prisma.employee.update({
        where: { id: employee.id },
        data: { primaryUnitId: serveryId },
      });
      await prisma.employeeUnitAccess.create({
        data: { employeeId: employee.id, unitId: serveryId },
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.scheduleEntry.create({
      data: {
        employeeId: employee.id,
        departmentId: departmentIds[item.deptKey],
        date: today,
        shift: ShiftType.FULL_DAY,
        workShiftId: item.firstName === "Tara" && evsWorkShift ? evsWorkShift.id : undefined,
        plannedStart: "07:00",
        plannedEnd: "15:00",
        createdById: adminUser?.id,
      },
    });

    if (item.firstName === "Tara") {
      const movedTo = unitIdByName["1A Naval Park"];
      if (movedTo) {
        await prisma.operationalAssignment.create({
          data: {
            facilityId: facility.id,
            departmentId: departmentIds[item.deptKey],
            employeeId: employee.id,
            unitId: movedTo,
            serviceDate: today,
            roleKey: "EVS_AIDE",
            roleLabel: "EVS Aide",
            source: "REASSIGNMENT",
            status: "PLANNED",
            changeReason: "Lunch coverage support for unit staffing gap",
            clientCommandId: `seed-tara-move-${today.toISOString().slice(0, 10)}`,
          },
        });
      }
    }
  }

  const vendor = await prisma.vendor.upsert({
    where: {
      facilityId_name: {
        facilityId: facility.id,
        name: "Buffalo Food Equipment Service",
      },
    },
    update: {
      phone: "716-555-0140",
      email: "service@buffaloequipment.local",
      contactName: "Dispatch",
    },
    create: {
      facilityId: facility.id,
      name: "Buffalo Food Equipment Service",
      phone: "716-555-0140",
      email: "service@buffaloequipment.local",
      contactName: "Dispatch",
    },
  });

  const sampleAssets = [
    {
      assetCode: "CK-COOL-01",
      name: "Main Kitchen Walk-In Cooler",
      equipmentType: "Cooler",
      unitName: "Central Kitchen",
      model: "ArcticMax 9000",
      serialNumber: "AM9K-001",
      status: AssetStatus.OPERATIONAL,
    },
    {
      assetCode: "SV-COOL-1A",
      name: "1A Servery Cooler",
      equipmentType: "Cooler",
      unitName: "1A Naval Park",
      model: "SafeChill 420",
      serialNumber: "SC420-1A",
      status: AssetStatus.OPERATIONAL,
    },
  ];

  for (const item of sampleAssets) {
    const unitId = unitIdByName[item.unitName];
    if (!unitId) continue;

    await prisma.asset.upsert({
      where: { assetCode: item.assetCode },
      update: {
        name: item.name,
        equipmentType: item.equipmentType,
        unitId,
        model: item.model,
        serialNumber: item.serialNumber,
        status: item.status,
        vendorId: vendor.id,
        departmentId: departmentIds.PLANT,
      },
      create: {
        assetCode: item.assetCode,
        name: item.name,
        equipmentType: item.equipmentType,
        unitId,
        model: item.model,
        serialNumber: item.serialNumber,
        status: item.status,
        vendorId: vendor.id,
        departmentId: departmentIds.PLANT,
      },
    });
  }

  const coolerAsset = await prisma.asset.findUnique({
    where: { assetCode: "SV-COOL-1A" },
    select: { id: true },
  });

  const existingRepair = await prisma.repair.findFirst({
    where: { title: "1A cooler door gasket is loose" },
    select: { id: true },
  });

  if (!existingRepair) {
    const codes = await prisma.$queryRaw`SELECT nextval('"RepairCodeSequence"') AS value`;
    const repairCode = `R-${String(codes[0].value).padStart(5, "0")}`;
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + 7);

    const repair = await prisma.repair.create({
      data: {
        repairCode,
        unitId: unitIdByName["1A Naval Park"],
        assetId: coolerAsset?.id,
        vendorId: vendor.id,
        title: "1A cooler door gasket is loose",
        description:
          "Door gasket no longer seals fully. Cooler struggles to hold temperature during lunch service.",
        priority: RepairPriority.HIGH,
        status: RepairStatus.OPEN,
        workOrderKind: WorkOrderKind.CORRECTIVE,
        requestingDepartmentId: departmentIds.DIETARY,
        responsibleDepartmentId: departmentIds.PLANT,
        dueAt,
        reportedById: adminUser?.id,
      },
    });

    await prisma.repairUpdate.create({
      data: {
        repairId: repair.id,
        updateText: "Ticket opened and vendor contacted for site visit.",
        updatedById: adminUser?.id,
        statusAfterUpdate: RepairStatus.OPEN,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
