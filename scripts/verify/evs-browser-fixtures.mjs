#!/usr/bin/env node
/**
 * Phase 11B EVS browser fixtures (synthetic, no PHI).
 * Disposable VERIFY_DATABASE_URL only.
 */
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARTIFACT_DIR = join(
  ROOT,
  "tmp",
  process.env.EVS_BROWSER_ARTIFACT_DIR_NAME || "evs-browser-artifacts",
);
const FIXTURE_PATH =
  process.env.EVS_BROWSER_FIXTURE_PATH || join(ARTIFACT_DIR, "fixtures.json");
const PINS_PATH = join(ARTIFACT_DIR, "pins.env");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
const AUTH_SECRET = process.env.AUTH_SECRET;

function fail(message) {
  console.error(`evs-browser-fixtures: FAIL — ${message}`);
  process.exit(1);
}

function cuidLike() {
  return `c${randomBytes(12).toString("hex")}`;
}

function pinDigest(facilityId, pin) {
  return createHmac("sha256", AUTH_SECRET).update(`${facilityId}:${pin.trim()}`).digest("hex");
}

function serviceDateUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function upsertUser(db, { email, displayName, roleKey, facilityId, primaryDepartmentId }) {
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey } });
  const passwordHash = await bcrypt.hash(SYNTHETIC_PASSWORD, 12);
  return db.user.upsert({
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
}

async function ensureEmployee(db, {
  facilityId,
  email,
  firstName,
  lastName,
  departmentId,
  roleType = "STAFF",
  pinDigestValue = null,
}) {
  const existing = await db.employee.findFirst({
    where: { facilityId, email },
    select: { id: true },
  });
  if (existing) {
    return db.employee.update({
      where: { id: existing.id },
      data: {
        firstName,
        lastName,
        status: "ACTIVE",
        primaryDepartmentId: departmentId,
        roleType,
        ...(pinDigestValue ? { pinDigest: pinDigestValue, sessionVersion: 0 } : {}),
      },
      select: { id: true },
    });
  }
  return db.employee.create({
    data: {
      facilityId,
      email,
      firstName,
      lastName,
      status: "ACTIVE",
      primaryDepartmentId: departmentId,
      roleType,
      ...(pinDigestValue ? { pinDigest: pinDigestValue } : {}),
    },
    select: { id: true },
  });
}

async function ensureDeptMembership(db, employeeId, departmentId) {
  await db.employeeDepartment.upsert({
    where: { employeeId_departmentId: { employeeId, departmentId } },
    update: {},
    create: { employeeId, departmentId, roleType: "STAFF" },
  });
}

async function ensureResidentUnitsWithRooms(db, facilityId, evsId) {
  const unitSpecs = [
    { name: "EVS Floor 1 East", rooms: 5 },
    { name: "EVS Floor 2 West", rooms: 5 },
  ];
  const units = [];
  for (const spec of unitSpecs) {
    let unit = await db.unit.findFirst({
      where: { facilityId, name: spec.name },
      select: { id: true, name: true },
    });
    if (!unit) {
      unit = await db.unit.create({
        data: {
          facilityId,
          name: spec.name,
          unitType: "RESIDENT_AREA",
          hierarchyRole: "FLOOR",
          displayOrder: 300 + units.length,
          isActive: true,
        },
        select: { id: true, name: true },
      });
    }
    await db.unitDepartmentResponsibility.upsert({
      where: { unitId_departmentId: { unitId: unit.id, departmentId: evsId } },
      update: { kind: "PRIMARY" },
      create: { unitId: unit.id, departmentId: evsId, kind: "PRIMARY" },
    });

    const existingRooms = await db.unitSpace.count({
      where: { unitId: unit.id, spaceType: "PATIENT_ROOM", isActive: true },
    });
    for (let i = existingRooms; i < spec.rooms; i += 1) {
      await db.unitSpace.create({
        data: {
          facilityId,
          unitId: unit.id,
          name: `${spec.name} Room ${i + 1}`,
          spaceType: "PATIENT_ROOM",
          roomNumber: `${units.length + 1}${String(i + 1).padStart(2, "0")}`,
          isActive: true,
          sortOrder: 10 + i,
        },
      });
    }
    units.push(unit);
  }
  return units;
}

async function main() {
  if (!SYNTHETIC_PASSWORD) fail("SEED_DEMO_PASSWORD is required");
  if (!AUTH_SECRET) fail("AUTH_SECRET is required");

  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) fail("VERIFY_DATABASE_URL is required");
  const target = assertDisposableDatabaseUrl(url);
  console.log(`evs-browser-fixtures: target ${target.databaseName}`);

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const db = new PrismaClient({ datasources: { db: { url } } });

  try {
    const facility = await db.facility.findFirstOrThrow({
      where: { displayName: "Terrace View Long Term Care" },
      select: { id: true, timezone: true, displayName: true },
    });
    const evs = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "EVS", isActive: true },
      select: { id: true, name: true },
    });
    const dietary = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "DIETARY", isActive: true },
      select: { id: true },
    });

    const manager = await upsertUser(db, {
      email: "evs.manager@ltc.local",
      displayName: "EVS Browser Manager",
      roleKey: "MANAGER",
      facilityId: facility.id,
      primaryDepartmentId: evs.id,
    });
    const supervisor = await upsertUser(db, {
      email: "evs.supervisor@ltc.local",
      displayName: "EVS Browser Supervisor",
      roleKey: "SUPERVISOR",
      facilityId: facility.id,
      primaryDepartmentId: evs.id,
    });
    const staff = await upsertUser(db, {
      email: "evs.staff@ltc.local",
      displayName: "EVS Browser Staff",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: evs.id,
    });
    const dietaryStaff = await upsertUser(db, {
      email: "evs.dietary.staff@ltc.local",
      displayName: "EVS Gate Dietary Staff",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const faWithout = await upsertUser(db, {
      email: "evs.fa.no-evs@ltc.local",
      displayName: "EVS FA Without EVS",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: null,
    });
    const faWith = await upsertUser(db, {
      email: "evs.fa.evs@ltc.local",
      displayName: "EVS FA With EVS",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: evs.id,
    });

    const staffPin = "135790";
    const managerEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: manager.email,
      firstName: "Evs",
      lastName: "ManagerEmp",
      departmentId: evs.id,
      roleType: "MANAGER",
    });
    await ensureDeptMembership(db, managerEmp.id, evs.id);

    const supervisorEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: supervisor.email,
      firstName: "Evs",
      lastName: "SupervisorEmp",
      departmentId: evs.id,
      roleType: "SUPERVISOR",
    });
    await ensureDeptMembership(db, supervisorEmp.id, evs.id);

    const staffEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: staff.email,
      firstName: "Evs",
      lastName: "StaffEmp",
      departmentId: evs.id,
      pinDigestValue: pinDigest(facility.id, staffPin),
    });
    await ensureDeptMembership(db, staffEmp.id, evs.id);

    const dietaryStaffEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: dietaryStaff.email,
      firstName: "Dietary",
      lastName: "OnlyEmp",
      departmentId: dietary.id,
    });
    await ensureDeptMembership(db, dietaryStaffEmp.id, dietary.id);

    const units = await ensureResidentUnitsWithRooms(db, facility.id, evs.id);
    const primaryUnit = units[0];
    const secondaryUnit = units[1] ?? units[0];

    const roomCount = await db.unitSpace.count({
      where: {
        facilityId: facility.id,
        unitId: { in: units.map((u) => u.id) },
        spaceType: "PATIENT_ROOM",
        isActive: true,
      },
    });
    if (roomCount < 8) fail(`expected ≥8 PATIENT_ROOM spaces, got ${roomCount}`);

    const serviceDateKey = new Date().toISOString().slice(0, 10);
    const serviceDate = serviceDateUtc(serviceDateKey);

    // Published EVS cycle (no mealType)
    const cycleStable = "morning_routine";
    let cycle = await db.departmentOperationalCycle.findFirst({
      where: { departmentId: evs.id, stableKey: cycleStable, version: 1 },
    });
    const cycleData = {
      facilityId: facility.id,
      departmentId: evs.id,
      stableKey: cycleStable,
      version: 1,
      label: "Morning Routine",
      description: "EVS morning cleaning window",
      cycleType: "PREPARATION",
      displaySequence: 10,
      startLocal: "06:00",
      endLocal: "10:00",
      overnight: false,
      applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      effectiveFrom: serviceDateUtc("2026-01-01"),
      effectiveTo: null,
      mealType: null,
      locationMode: "UNIT_TYPES",
      applicableUnitTypes: ["RESIDENT_AREA", "COMMON_AREA", "EVS_ZONE"],
      expectedMilestones: [],
      status: "PUBLISHED",
      publishedAt: new Date(),
    };
    if (cycle) {
      cycle = await db.departmentOperationalCycle.update({
        where: { id: cycle.id },
        data: cycleData,
      });
    } else {
      cycle = await db.departmentOperationalCycle.create({ data: cycleData });
    }

    const article =
      (await db.knowledgeArticle.findFirst({
        where: {
          facilityId: facility.id,
          status: "PUBLISHED",
          OR: [{ departmentId: evs.id }, { departmentId: null }],
        },
        select: { id: true, title: true },
      })) ??
      (await db.knowledgeArticle.create({
        data: {
          id: cuidLike(),
          facilityId: facility.id,
          departmentId: evs.id,
          title: "EVS Room Clean Procedure",
          summary: "Synthetic EVS procedure",
          body: "Step 1. Enter room.\nStep 2. Clean surfaces.\nStep 3. Exit.",
          status: "PUBLISHED",
          category: "SOP",
          publishedAt: new Date(),
        },
        select: { id: true, title: true },
      }));

    // Published EVS Work Plan with SPACE_TYPE PATIENT_ROOM
    const planId = cuidLike();
    const itemId = cuidLike();
    const itemKey = "surfaces";
    await db.departmentWorkPlan.create({
      data: {
        id: planId,
        facilityId: facility.id,
        departmentId: evs.id,
        stableKey: `evs_browser_room_clean_${planId.slice(-6)}`,
        version: 1,
        name: "Browser EVS Room Clean",
        description: "Published EVS Work Plan for browser gate",
        status: "PUBLISHED",
        publishedAt: new Date(),
        weekdays: [],
        applicabilities: {
          create: [{ id: cuidLike(), kind: "SPACE_TYPE", spaceType: "PATIENT_ROOM" }],
        },
        items: {
          create: [
            {
              id: itemId,
              itemKey,
              label: "Clean high-touch surfaces",
              instructions: "Wipe high-touch surfaces per procedure.",
              displaySequence: 10,
              priority: "ROUTINE",
              completionMode: "EXPLICIT_CONFIRMATION",
              responsibilityMode: "UNIT_SHARED",
              scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
              knowledgeArticleId: article.id,
              procedureTitleSnapshot: article.title,
              supervisorVisible: true,
            },
          ],
        },
      },
    });

    // Confirmed assignment for primary unit
    let plan = await db.operationalAssignmentPlan.findFirst({
      where: { facilityId: facility.id, departmentId: evs.id, serviceDate },
    });
    if (!plan) {
      plan = await db.operationalAssignmentPlan.create({
        data: {
          facilityId: facility.id,
          departmentId: evs.id,
          serviceDate,
          status: "CONFIRMED",
        },
      });
    } else if (plan.status !== "CONFIRMED") {
      plan = await db.operationalAssignmentPlan.update({
        where: { id: plan.id },
        data: { status: "CONFIRMED" },
      });
    }
    const existingAssign = await db.operationalAssignment.findFirst({
      where: { planId: plan.id, unitId: primaryUnit.id, employeeId: staffEmp.id },
    });
    if (!existingAssign) {
      await db.operationalAssignment.create({
        data: {
          facilityId: facility.id,
          departmentId: evs.id,
          planId: plan.id,
          serviceDate,
          employeeId: staffEmp.id,
          unitId: primaryUnit.id,
          status: "PLANNED",
          roleKey: "EVS_AIDE",
          roleLabel: "EVS Aide",
          source: "MANUAL",
        },
      });
    }

    // Schedule entry so Job Flow can resolve
    const scheduleExisting = await db.scheduleEntry.findFirst({
      where: { employeeId: staffEmp.id, date: serviceDate },
    });
    if (!scheduleExisting) {
      await db.scheduleEntry.create({
        data: {
          employeeId: staffEmp.id,
          date: serviceDate,
          shift: "FULL_DAY",
          roleType: "STAFF",
          unitId: primaryUnit.id,
          plannedStart: "06:00",
          plannedEnd: "14:00",
        },
      });
    }

    // EVS INSPECTION template
    const inspId = cuidLike();
    await db.operationalTemplate.create({
      data: {
        id: inspId,
        facilityId: facility.id,
        departmentId: evs.id,
        stableKey: `evs_room_inspection_${inspId.slice(-6)}`,
        version: 1,
        name: "EVS Room Inspection",
        purposeType: "INSPECTION",
        status: "PUBLISHED",
        publishedAt: new Date(),
        allowAdHoc: true,
        fields: {
          create: [
            {
              id: cuidLike(),
              fieldKey: "result",
              label: "Inspection result",
              fieldType: "PASS_NEEDS_ATTENTION",
              isRequired: true,
              displaySequence: 10,
              allowedSelections: ["PASS", "NEEDS_ATTENTION"],
              correctiveActionTrigger: true,
              correctiveActionRequired: false,
            },
          ],
        },
        applicabilities: {
          create: [{ id: cuidLike(), kind: "SPACE_TYPE", spaceType: "PATIENT_ROOM" }],
        },
        schedules: {
          create: [{ id: cuidLike(), kind: "ONCE_PER_OPERATIONAL_DATE" }],
        },
      },
    });

    // Asset for issue reporting (no vendor required on create for thin path)
    const asset = await db.asset.create({
      data: {
        id: cuidLike(),
        assetCode: `EVS-CART-${cuidLike().slice(1, 7).toUpperCase()}`,
        name: "EVS Supply Cart A",
        equipmentType: "Cart",
        unitId: primaryUnit.id,
        departmentId: evs.id,
        status: "OPERATIONAL",
        statusHistory: {
          create: {
            id: cuidLike(),
            fromStatus: null,
            toStatus: "OPERATIONAL",
            reason: "INITIAL",
            note: "EVS browser fixture",
          },
        },
      },
      select: { id: true, assetCode: true, name: true },
    });

    const out = {
      facilityId: facility.id,
      facilityTimezone: facility.timezone || "America/New_York",
      departmentId: evs.id,
      dietaryDepartmentId: dietary.id,
      unitId: primaryUnit.id,
      unitName: primaryUnit.name,
      secondaryUnitId: secondaryUnit.id,
      secondaryUnitName: secondaryUnit.name,
      roomCount,
      serviceDateKey,
      managerEmail: manager.email,
      supervisorEmail: supervisor.email,
      staffEmail: staff.email,
      dietaryStaffEmail: dietaryStaff.email,
      faWithoutEvsEmail: faWithout.email,
      faWithEvsEmail: faWith.email,
      staffEmployeeId: staffEmp.id,
      workPlanId: planId,
      workPlanItemId: itemId,
      workPlanItemKey: itemKey,
      workPlanName: "Browser EVS Room Clean",
      cycleId: cycle.id,
      cycleLabel: cycle.label,
      procedureArticleId: article.id,
      procedureTitle: article.title,
      inspectionTemplateId: inspId,
      assetId: asset.id,
      assetCode: asset.assetCode,
      assetName: asset.name,
      workPlansPath: "/staffing/work-plans",
      cyclesPath: "/staffing/cycles",
      operationsBoardPath: "/staffing/operations",
      logBookPath: "/staffing/log-book",
      assetsPath: "/assets",
      unitWorkspacePath: `/unit/${primaryUnit.id}`,
      staffPin,
    };
    writeFileSync(FIXTURE_PATH, JSON.stringify(out, null, 2));
    writeFileSync(
      PINS_PATH,
      [`EVS_STAFF_PIN=${staffPin}`, `SEED_DEMO_PASSWORD=${SYNTHETIC_PASSWORD}`].join("\n") + "\n",
    );
    console.log(`evs-browser-fixtures: wrote ${FIXTURE_PATH} (rooms=${roomCount})`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
