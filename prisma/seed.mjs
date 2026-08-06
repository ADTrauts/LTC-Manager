import { readFileSync } from "node:fs";

import bcrypt from "bcryptjs";
import {
  AssetStatus,
  EmploymentType,
  EmployeeStatus,
  LogRecurrence,
  MealType,
  PrismaClient,
  RepairPriority,
  RepairStatus,
  RoleKey,
  ShiftType,
  UnitType,
  WorkOrderKind,
} from "@prisma/client";

import { applyLogTemplatePresets } from "./apply-log-template-presets.mjs";
import { backfillUnitDepartmentRows, upsertDefaultDepartments } from "./ensure-departments.mjs";

const prisma = new PrismaClient();

/** Keep in sync with migration `20260329120000_phase_a_facility` default facility id. */
const SEED_FACILITY_ID = "cmfacseed0000000000000001";
/** Wave 11 seed Organization for Terrace View. */
const SEED_ORGANIZATION_ID = "cmorgseed0000000000000001";

/**
 * Legacy compatibility mirror for `AppRoute` / `RoleRoutePermission`.
 *
 * These tables are NON-AUTHORITATIVE. Runtime authorization is decided entirely by the platform
 * route registry in `src/lib/route-registry/platform-routes.ts` and never reads them. Seed keeps
 * them populated for historical continuity and transitional inspection only, and the values come
 * from a file generated off that same registry (`npm run route-mirror:generate`), so the mirror
 * cannot drift into describing a policy the product does not enforce.
 */
const LEGACY_ROUTE_MIRROR = JSON.parse(
  readFileSync(new URL("./legacy-route-mirror.json", import.meta.url), "utf8"),
);


async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: SEED_ORGANIZATION_ID },
    update: {
      name: "Terrace View Organization",
      displayName: "Terrace View Organization",
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
      managementCompanyName: null,
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

  for (const route of LEGACY_ROUTE_MIRROR.routes) {
    const fields = {
      pathPrefix: route.pathPrefix,
      label: route.label,
      navVisible: route.navVisible,
      navOrder: route.navOrder,
      isActive: true,
      isCritical: route.isCritical,
    };
    await prisma.appRoute.upsert({
      where: { key: route.key },
      update: fields,
      create: { key: route.key, ...fields },
    });
  }

  const [dbRoles, dbRoutes] = await Promise.all([
    prisma.role.findMany({ select: { id: true, key: true } }),
    prisma.appRoute.findMany({ select: { id: true, pathPrefix: true } }),
  ]);
  const allowedRolesByPrefix = new Map(
    LEGACY_ROUTE_MIRROR.routes.map((route) => [route.pathPrefix, new Set(route.allowedRoles)]),
  );

  for (const role of dbRoles) {
    for (const route of dbRoutes) {
      const allowedRoles = allowedRolesByPrefix.get(route.pathPrefix);
      if (!allowedRoles) continue;
      const allowed = allowedRoles.has(role.key);
      await prisma.roleRoutePermission.upsert({
        where: {
          roleId_appRouteId: {
            roleId: role.id,
            appRouteId: route.id,
          },
        },
        update: { allowed },
        create: {
          roleId: role.id,
          appRouteId: route.id,
          allowed,
        },
      });
    }
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
      mealTimes: [
        { mealType: MealType.BREAKFAST, scheduledTime: "06:30" },
        { mealType: MealType.LUNCH, scheduledTime: "11:00" },
        { mealType: MealType.DINNER, scheduledTime: "16:00" },
      ],
    },
    {
      name: "Retail",
      unitType: UnitType.RETAIL,
      displayOrder: 20,
      mealTimes: [],
    },
    {
      name: "1A Naval Park",
      unitType: UnitType.SERVERY,
      displayOrder: 30,
      mealTimes: [
        { mealType: MealType.BREAKFAST, scheduledTime: "07:45" },
        { mealType: MealType.LUNCH, scheduledTime: "12:00" },
        { mealType: MealType.DINNER, scheduledTime: "17:00" },
      ],
    },
  ];

  const unitIdByName = {};

  for (const unit of starterUnits) {
    const savedUnit = await prisma.unit.upsert({
      where: {
        facilityId_name: {
          facilityId: facility.id,
          name: unit.name,
        },
      },
      update: {
        unitType: unit.unitType,
        displayOrder: unit.displayOrder,
      },
      create: {
        facilityId: facility.id,
        name: unit.name,
        unitType: unit.unitType,
        displayOrder: unit.displayOrder,
      },
    });

    await prisma.unitMealTime.deleteMany({ where: { unitId: savedUnit.id } });
    for (const mealTime of unit.mealTimes) {
      await prisma.unitMealTime.create({
        data: {
          unitId: savedUnit.id,
          mealType: mealTime.mealType,
          scheduledTime: mealTime.scheduledTime,
        },
      });
    }

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

  await applyLogTemplatePresets(prisma, {
    facilityId: facility.id,
    createdByRoleId: faRole.id,
    departmentIds,
  });

  const serveryId = unitIdByName["1A Naval Park"];
  const kitchenId = unitIdByName["Central Kitchen"];

  async function ensureLogAssignment(templateName, unitId, data) {
    if (!unitId) return;
    const tpl = await prisma.logTemplate.findFirst({
      where: { facilityId: facility.id, name: templateName },
      select: { id: true },
    });
    if (!tpl) return;
    const existing = await prisma.logAssignment.findFirst({
      where: { unitId, templateId: tpl.id },
      select: { id: true },
    });
    if (existing) return;
    await prisma.logAssignment.create({
      data: { unitId, templateId: tpl.id, ...data },
    });
  }

  await ensureLogAssignment("Unit Cooler Temp Log", serveryId, {
    recurrence: LogRecurrence.PER_MEAL,
    timesPerDay: 3,
    requiredRole: RoleKey.SUPERVISOR,
    isActive: true,
  });
  await ensureLogAssignment("Servery – Hot and cold holding", serveryId, {
    recurrence: LogRecurrence.PER_MEAL,
    timesPerDay: 3,
    requiredRole: RoleKey.SUPERVISOR,
    isActive: true,
  });
  await ensureLogAssignment("Walk-in cooler temperature", kitchenId, {
    recurrence: LogRecurrence.DAILY,
    timesPerDay: 1,
    isActive: true,
  });
  await ensureLogAssignment("Dishwashing – high-temp / machine", kitchenId, {
    recurrence: LogRecurrence.DAILY,
    timesPerDay: 1,
    isActive: true,
  });

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
  await prisma.assignmentOverride.deleteMany({
    where: { employeeId: { in: sampleEmployeeIds } },
  });
  await prisma.scheduleEntry.deleteMany({
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
    const schedule = await prisma.scheduleEntry.create({
      data: {
        employeeId: employee.id,
        unitId,
        date: today,
        shift: ShiftType.FULL_DAY,
        roleType: item.roleType,
        workShiftId: item.firstName === "Tara" && evsWorkShift ? evsWorkShift.id : undefined,
        plannedStart: "07:00",
        plannedEnd: "15:00",
        createdById: adminUser?.id,
      },
    });

    if (item.firstName === "Tara") {
      await prisma.assignmentOverride.create({
        data: {
          scheduleEntryId: schedule.id,
          employeeId: employee.id,
          oldUnitId: unitIdByName["Retail"],
          newUnitId: unitIdByName["1A Naval Park"],
          date: today,
          mealType: MealType.LUNCH,
          reason: "Lunch coverage support for unit staffing gap",
        },
      });
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
    const repairCount = await prisma.repair.count();
    const repairCode = `R-${String(repairCount + 1).padStart(5, "0")}`;
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
