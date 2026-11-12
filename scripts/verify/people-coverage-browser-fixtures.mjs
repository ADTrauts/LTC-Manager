#!/usr/bin/env node
/**
 * Phase 9C People & Coverage browser fixtures on a disposable database.
 * Builds scenario data for A (scale), C (multi-qual), D (shortage),
 * E (temporary assignment outside Team), and F (multi-Department).
 * Never prints credentials.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { activateFixtureAccount, linkFixtureAccount } from "./fixture-account.mjs";
import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_PATH =
  process.env.PEOPLE_COVERAGE_BROWSER_FIXTURE_PATH ||
  join(ROOT, "tmp", "people-coverage-browser-artifacts", "fixtures.json");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
if (!SYNTHETIC_PASSWORD) {
  console.error("people-coverage-browser-fixtures: SEED_DEMO_PASSWORD is required");
  process.exit(1);
}

function serviceDateUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function todayKey(timezone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

async function upsertUser(db, { email, displayName, roleKey, facilityId, primaryDepartmentId }) {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  const passwordHash = await bcrypt.hash(SYNTHETIC_PASSWORD, 12);
  const user = await db.user.upsert({
    where: { email },
    update: {
      displayName,
      facilityId,
      roleId: role.id,
      passwordHash,
      isActive: true,
      primaryDepartmentId,
      sessionVersion: 0,
    },
    create: {
      email,
      displayName,
      facilityId,
      roleId: role.id,
      passwordHash,
      isActive: true,
      primaryDepartmentId,
    },
    select: { id: true, email: true },
  });
  return activateFixtureAccount(db, user, { facilityId, roleKey });
}

async function ensureEmployee(db, input) {
  const existing = await db.employee.findFirst({
    where: { facilityId: input.facilityId, email: input.email },
    select: { id: true },
  });
  if (existing) {
    return db.employee.update({
      where: { id: existing.id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        status: "ACTIVE",
        primaryDepartmentId: input.primaryDepartmentId,
        roleType: input.roleType ?? "STAFF",
      },
      select: { id: true, firstName: true, lastName: true },
    });
  }
  return db.employee.create({
    data: {
      facilityId: input.facilityId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      status: "ACTIVE",
      primaryDepartmentId: input.primaryDepartmentId,
      roleType: input.roleType ?? "STAFF",
    },
    select: { id: true, firstName: true, lastName: true },
  });
}

async function ensureDeptMembership(db, employeeId, departmentId) {
  await db.employeeDepartment.upsert({
    where: { employeeId_departmentId: { employeeId, departmentId } },
    update: {},
    create: { employeeId, departmentId },
  });
}

async function ensureQualification(db, { facilityId, employeeId, departmentId, roleKey }) {
  await db.employeeOperationalRoleQualification.upsert({
    where: {
      employeeId_departmentId_roleKey: { employeeId, departmentId, roleKey },
    },
    update: { status: "ACTIVE", revokedAt: null },
    create: {
      facilityId,
      employeeId,
      departmentId,
      roleKey,
      status: "ACTIVE",
    },
  });
}

async function ensureTeam(db, { facilityId, departmentId, displayName, managerEmployeeId }) {
  const existing = await db.departmentTeam.findFirst({
    where: { facilityId, departmentId, displayName, status: "ACTIVE" },
    select: { id: true },
  });
  if (existing) {
    return db.departmentTeam.update({
      where: { id: existing.id },
      data: { managerEmployeeId: managerEmployeeId ?? null },
      select: { id: true, displayName: true },
    });
  }
  return db.departmentTeam.create({
    data: {
      facilityId,
      departmentId,
      displayName,
      managerEmployeeId: managerEmployeeId ?? null,
      status: "ACTIVE",
    },
    select: { id: true, displayName: true },
  });
}

async function ensurePrimaryMembership(db, { employeeId, teamId }) {
  await db.employeeTeamMembership.upsert({
    where: { employeeId_teamId: { employeeId, teamId } },
    update: { isPrimary: true },
    create: { employeeId, teamId, isPrimary: true },
  });
}

async function main() {
  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  const target = assertDisposableDatabaseUrl(url);
  console.log(`people-coverage-browser-fixtures: target ${target.databaseName}`);

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const facility = await db.facility.findFirstOrThrow({
      where: { displayName: "Terrace View Long Term Care" },
      select: { id: true, timezone: true, displayName: true },
    });
    const dietary = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "DIETARY", isActive: true },
      select: { id: true, name: true },
    });
    const plant = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "PLANT", isActive: true },
      select: { id: true, name: true },
    });

    async function ensureDietarySpace(name, unitId) {
      const existing = await db.unitSpace.findFirst({
        where: { facilityId: facility.id, unitId, name, isActive: true },
        select: { id: true, name: true, unitId: true },
      });
      const space =
        existing ??
        (await db.unitSpace.create({
          data: {
            facilityId: facility.id,
            unitId,
            name,
            spaceType: "SERVICE_AREA",
            isActive: true,
          },
          select: { id: true, name: true, unitId: true },
        }));
      await db.unitSpaceResponsibility.upsert({
        where: {
          spaceId_departmentId: { spaceId: space.id, departmentId: dietary.id },
        },
        update: {},
        create: { spaceId: space.id, departmentId: dietary.id },
      });
      return space;
    }

    const kitchenUnit = await db.unit.findFirstOrThrow({
      where: { facilityId: facility.id, name: "Central Kitchen", isActive: true },
      select: { id: true },
    });
    const neighborhoodUnit = await db.unit.findFirstOrThrow({
      where: { facilityId: facility.id, name: "1A Naval Park", isActive: true },
      select: { id: true },
    });
    // These legacy demo units predate the physical hierarchy. Verification uses
    // real Floor → Neighborhood → Space structure, including offline authority.
    const floor = await db.unit.findFirst({ where: { facilityId: facility.id, name: "People & Coverage fixture floor" } }) ??
      await db.unit.create({ data: { facilityId: facility.id, name: "People & Coverage fixture floor", unitType: "OTHER", hierarchyRole: "FLOOR" } });
    await db.unit.updateMany({ where: { id: { in: [kitchenUnit.id, neighborhoodUnit.id] }, facilityId: facility.id },
      data: { hierarchyRole: "NEIGHBORHOOD", parentUnitId: floor.id } });
    const primarySpace = await ensureDietarySpace("Phase 9C Primary Servery", kitchenUnit.id);
    const altSpace = await ensureDietarySpace("Phase 9C Alt Dining", neighborhoodUnit.id);

    let periodCycle = await db.departmentOperationalCycle.findFirst({
      where: {
        facilityId: facility.id,
        departmentId: dietary.id,
        nodeKind: "PERIOD",
        status: "PUBLISHED",
      },
      select: { id: true, stableKey: true, label: true },
      orderBy: { version: "desc" },
    });
    if (!periodCycle) {
      periodCycle = await db.departmentOperationalCycle.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          stableKey: "phase9c-breakfast",
          label: "Breakfast",
          nodeKind: "PERIOD",
          cycleType: "SERVICE",
          status: "PUBLISHED",
          startLocal: "07:00",
          endLocal: "09:00",
          applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          effectiveFrom: new Date("2020-01-01"),
          locationMode: "ALL_DEPARTMENT_UNITS",
          expectedMilestones: [],
          publishedAt: new Date(),
        },
        select: { id: true, stableKey: true, label: true },
      });
    }

    const admin = await upsertUser(db, {
      email: "people.coverage.admin@ltc.local",
      displayName: "People Coverage Admin",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: null,
    });

    const multiQual = await ensureEmployee(db, {
      facilityId: facility.id,
      email: "people.coverage.multiqual@ltc.local",
      firstName: "Casey",
      lastName: "MultiQual",
      primaryDepartmentId: dietary.id,
    });
    await ensureDeptMembership(db, multiQual.id, dietary.id);
    await ensureQualification(db, {
      facilityId: facility.id,
      employeeId: multiQual.id,
      departmentId: dietary.id,
      roleKey: "SERVER",
    });
    await ensureQualification(db, {
      facilityId: facility.id,
      employeeId: multiQual.id,
      departmentId: dietary.id,
      roleKey: "DISHWASHING",
    });

    const dualDept = await ensureEmployee(db, {
      facilityId: facility.id,
      email: "people.coverage.dualdept@ltc.local",
      firstName: "Dana",
      lastName: "DualDept",
      primaryDepartmentId: dietary.id,
    });
    await ensureDeptMembership(db, dualDept.id, dietary.id);
    await ensureDeptMembership(db, dualDept.id, plant.id);
    await ensureQualification(db, {
      facilityId: facility.id,
      employeeId: dualDept.id,
      departmentId: dietary.id,
      roleKey: "SERVER",
    });
    await ensureQualification(db, {
      facilityId: facility.id,
      employeeId: dualDept.id,
      departmentId: plant.id,
      roleKey: "WORK_ORDER_RESPONSE",
    });

    const reassign = await ensureEmployee(db, {
      facilityId: facility.id,
      email: "people.coverage.reassign@ltc.local",
      firstName: "Riley",
      lastName: "Reassign",
      primaryDepartmentId: dietary.id,
    });
    await ensureDeptMembership(db, reassign.id, dietary.id);
    await ensureQualification(db, {
      facilityId: facility.id,
      employeeId: reassign.id,
      departmentId: dietary.id,
      roleKey: "SERVER",
    });

    const filler = await ensureEmployee(db, {
      facilityId: facility.id,
      email: "people.coverage.filler@ltc.local",
      firstName: "Finley",
      lastName: "Filler",
      primaryDepartmentId: dietary.id,
    });
    await ensureDeptMembership(db, filler.id, dietary.id);
    await ensureQualification(db, {
      facilityId: facility.id,
      employeeId: filler.id,
      departmentId: dietary.id,
      roleKey: "SERVER",
    });

    const kitchenTeam = await ensureTeam(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      displayName: "Kitchen Team",
      managerEmployeeId: multiQual.id,
    });
    const serveryTeam = await ensureTeam(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      displayName: "Servery Team",
      managerEmployeeId: dualDept.id,
    });
    await ensurePrimaryMembership(db, { employeeId: multiQual.id, teamId: kitchenTeam.id });
    await ensurePrimaryMembership(db, { employeeId: dualDept.id, teamId: serveryTeam.id });
    await ensurePrimaryMembership(db, { employeeId: reassign.id, teamId: kitchenTeam.id });
    await ensurePrimaryMembership(db, { employeeId: filler.id, teamId: serveryTeam.id });

    const scaleCount = 100;
    for (let i = 0; i < scaleCount; i++) {
      const n = String(i + 1).padStart(3, "0");
      const emp = await ensureEmployee(db, {
        facilityId: facility.id,
        email: `people.coverage.scale.${n}@ltc.local`,
        firstName: `Scale${n}`,
        lastName: "Dietary",
        primaryDepartmentId: dietary.id,
      });
      await ensureDeptMembership(db, emp.id, dietary.id);
      const teamId = i % 2 === 0 ? kitchenTeam.id : serveryTeam.id;
      await ensurePrimaryMembership(db, { employeeId: emp.id, teamId });
      if (i % 5 === 0) {
        await ensureQualification(db, {
          facilityId: facility.id,
          employeeId: emp.id,
          departmentId: dietary.id,
          roleKey: "SERVER",
        });
      }
    }

    const serviceDateKey = todayKey(facility.timezone);
    const serviceDate = serviceDateUtc(serviceDateKey);

    // Scheduled but not assigned — must not fill Coverage (scenario D).
    for (const employeeId of [reassign.id, dualDept.id]) {
      const existing = await db.scheduleEntry.findFirst({
        where: { employeeId, date: serviceDate },
        select: { id: true },
      });
      if (!existing) {
        await db.scheduleEntry.create({
          data: {
            employeeId,
            date: serviceDate,
            shift: "FULL_DAY",
            departmentId: dietary.id,
            plannedStart: "06:00",
            plannedEnd: "14:00",
          },
        });
      }
    }

    const cycleKeys = periodCycle ? [periodCycle.stableKey] : [];
    await db.operationalAssignmentTemplate.deleteMany({
      where: {
        facilityId: facility.id,
        departmentId: dietary.id,
        name: "Phase 9C Shortage Coverage",
      },
    });
    const published = await db.operationalAssignmentTemplate.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        stableKey: `cov_phase9c_shortage_${Date.now()}`,
        version: 1,
        status: "PUBLISHED",
        name: "Phase 9C Shortage Coverage",
        description: "Two Servers required; one Assignment exists",
        isActive: true,
        effectiveFrom: serviceDate,
        items: {
          create: [
            {
              roleKey: "SERVER",
              roleLabel: "Server",
              requiredCount: 2,
              spaceId: primarySpace.id,
              applicableOperationalCycleStableKeys: cycleKeys,
              sortOrder: 1,
            },
          ],
        },
      },
      select: { id: true, status: true },
    });

    const draft = await db.operationalAssignmentTemplate.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        stableKey: `cov_phase9c_draft_${Date.now()}`,
        version: 1,
        status: "DRAFT",
        name: "Phase 9C Unpublished Draft",
        isActive: true,
        items: {
          create: [
            {
              roleKey: "COOK",
              roleLabel: "Cook",
              requiredCount: 1,
              spaceId: altSpace.id,
              applicableOperationalCycleStableKeys: cycleKeys,
              sortOrder: 1,
            },
          ],
        },
      },
      select: { id: true, status: true },
    });

    await db.operationalAssignmentPlan.deleteMany({
      where: {
        facilityId: facility.id,
        departmentId: dietary.id,
        serviceDate,
      },
    });
    const plan = await db.operationalAssignmentPlan.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        serviceDate,
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
      select: { id: true },
    });

    await db.operationalAssignment.deleteMany({
      where: {
        facilityId: facility.id,
        departmentId: dietary.id,
        serviceDate,
      },
    });

    // One matching Assignment for a required count of 2 (scenario D).
    const shortageAssignment = await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        employeeId: filler.id,
        unitId: primarySpace.unitId,
        serviceDate,
        planId: plan.id,
        roleKey: "SERVER",
        roleLabel: "Server",
        status: "ACTIVE",
        startsAt: new Date(`${serviceDateKey}T06:00:00`),
        endsAt: new Date(`${serviceDateKey}T14:00:00`),
        locations: {
          create: [{ unitSpaceId: primarySpace.id, unitId: primarySpace.unitId, sortOrder: 1 }],
        },
      },
      select: { id: true },
    });

    // Temporary reassignment: Riley stays on Kitchen Team but works the alt space (scenario E).
    const tempAssignment = await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        employeeId: reassign.id,
        unitId: altSpace.unitId,
        serviceDate,
        planId: plan.id,
        roleKey: "SERVER",
        roleLabel: "Server",
        status: "ACTIVE",
        startsAt: new Date(`${serviceDateKey}T10:00:00`),
        endsAt: new Date(`${serviceDateKey}T18:00:00`),
        locations: {
          create: [{ unitSpaceId: altSpace.id, unitId: altSpace.unitId, sortOrder: 1 }],
        },
      },
      select: { id: true },
    });

    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    writeFileSync(
      FIXTURE_PATH,
      JSON.stringify(
        {
          facilityId: facility.id,
          facilityName: facility.displayName,
          dietaryDepartmentId: dietary.id,
          dietaryDepartmentName: dietary.name,
          plantDepartmentId: plant.id,
          plantDepartmentName: plant.name,
          serviceDateKey,
          adminEmail: admin.email,
          peopleHref: `/build/departments/${dietary.id}?tab=people`,
          plantPeopleHref: `/build/departments/${plant.id}?tab=people`,
          employeesDietaryHref: `/employees?dept=${dietary.id}`,
          employeesPlantHref: `/employees?dept=${plant.id}`,
          assignmentsHref: `/staffing/assignments?date=${serviceDateKey}&department=${dietary.id}`,
          primarySpaceId: primarySpace.id,
          primarySpaceName: primarySpace.name,
          altSpaceId: altSpace.id,
          altSpaceName: altSpace.name,
          periodCycleStableKey: periodCycle?.stableKey ?? null,
          periodCycleLabel: periodCycle?.label ?? null,
          publishedTemplateId: published.id,
          draftTemplateId: draft.id,
          kitchenTeamId: kitchenTeam.id,
          serveryTeamId: serveryTeam.id,
          multiQualEmployeeId: multiQual.id,
          dualDeptEmployeeId: dualDept.id,
          reassignEmployeeId: reassign.id,
          fillerEmployeeId: filler.id,
          shortageAssignmentId: shortageAssignment.id,
          tempAssignmentId: tempAssignment.id,
          scaleEmployeeCount: scaleCount,
          expectedTodayHeadline: "Staffing needs attention",
          expectedShortfall: 1,
          expectedRequired: 2,
          expectedAssigned: 1,
        },
        null,
        2,
      ),
    );
    console.log("people-coverage-browser-fixtures: wrote fixtures (no secrets)");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(`people-coverage-browser-fixtures: FAIL — ${err?.message || err}`);
  process.exit(1);
});
