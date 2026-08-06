#!/usr/bin/env node
/**
 * Synthetic fixtures for Phase 9B Dietary Job Flow / Supervisor Operations Board
 * browser certification. Disposable VERIFY_DATABASE_URL only. Never prints secrets.
 */
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARTIFACT_DIR = join(ROOT, "tmp", "job-flow-browser-artifacts");
const FIXTURE_PATH =
  process.env.JOB_FLOW_BROWSER_FIXTURE_PATH || join(ARTIFACT_DIR, "fixtures.json");
const PINS_PATH = join(ARTIFACT_DIR, "pins.env");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
if (!SYNTHETIC_PASSWORD) {
  console.error("job-flow-browser-fixtures: SEED_DEMO_PASSWORD is required");
  process.exit(1);
}

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  console.error("job-flow-browser-fixtures: AUTH_SECRET is required");
  process.exit(1);
}

/** Target servery count in the 12–17 band for Supervisor multi-unit overview. */
const TARGET_SERVERY_COUNT = 14;

function pinDigest(facilityId, pin) {
  return createHmac("sha256", AUTH_SECRET).update(`${facilityId}:${pin.trim()}`).digest("hex");
}

function serviceDateUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function minutesToHhMm(totalMinutes) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  dietaryId,
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
        primaryDepartmentId: dietaryId,
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
      primaryDepartmentId: dietaryId,
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

async function ensureUnitMealTimes(db, unitId, offsetsMinutes) {
  const meals = [
    { mealType: "BREAKFAST", scheduledTime: minutesToHhMm(7 * 60 + offsetsMinutes) },
    { mealType: "LUNCH", scheduledTime: minutesToHhMm(12 * 60 + offsetsMinutes) },
    { mealType: "DINNER", scheduledTime: minutesToHhMm(17 * 60 + offsetsMinutes) },
  ];
  for (const meal of meals) {
    await db.unitMealTime.upsert({
      where: { unitId_mealType: { unitId, mealType: meal.mealType } },
      update: { scheduledTime: meal.scheduledTime, isActive: true },
      create: {
        unitId,
        mealType: meal.mealType,
        scheduledTime: meal.scheduledTime,
        isActive: true,
      },
    });
  }
}

async function ensureServeryUnits(db, facilityId, dietaryId, evsId) {
  const existing = await db.unit.findMany({
    where: { facilityId, unitType: "SERVERY", isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const units = [...existing];
  let nextIndex = 1;
  while (units.length < TARGET_SERVERY_COUNT) {
    const name = `JF Servery ${String(nextIndex).padStart(2, "0")}`;
    nextIndex += 1;
    if (units.some((u) => u.name === name)) continue;
    const created = await db.unit.create({
      data: {
        facilityId,
        name,
        unitType: "SERVERY",
        displayOrder: 200 + units.length,
        isActive: true,
      },
      select: { id: true, name: true },
    });
    units.push(created);
  }

  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    await ensureUnitMealTimes(db, unit.id, (i % 7) * 5);
    await db.unitDepartmentResponsibility.upsert({
      where: { unitId_departmentId: { unitId: unit.id, departmentId: dietaryId } },
      update: { kind: "PRIMARY" },
      create: { unitId: unit.id, departmentId: dietaryId, kind: "PRIMARY" },
    });
    if (evsId) {
      await db.unitDepartmentResponsibility.upsert({
        where: { unitId_departmentId: { unitId: unit.id, departmentId: evsId } },
        update: { kind: "PRIMARY" },
        create: { unitId: unit.id, departmentId: evsId, kind: "PRIMARY" },
      });
    }
  }

  return units;
}

async function ensurePublishedCycle(db, {
  facilityId,
  departmentId,
  stableKey,
  label,
  description,
  cycleType,
  displaySequence,
  startLocal,
  endLocal,
  mealType,
  expectedMilestones,
  status = "PUBLISHED",
  effectiveFrom,
}) {
  const existing = await db.departmentOperationalCycle.findFirst({
    where: { departmentId, stableKey, version: 1 },
    select: { id: true },
  });
  const data = {
    facilityId,
    departmentId,
    stableKey,
    version: 1,
    label,
    description,
    cycleType,
    displaySequence,
    startLocal,
    endLocal,
    overnight: false,
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom,
    effectiveTo: null,
    mealType: mealType ?? null,
    locationMode: "UNIT_TYPES",
    applicableUnitTypes: ["SERVERY", "KITCHEN"],
    expectedMilestones: expectedMilestones ?? [],
    status,
    publishedAt: status === "PUBLISHED" ? new Date() : null,
    retiredAt: status === "RETIRED" ? new Date() : null,
  };
  if (existing) {
    return db.departmentOperationalCycle.update({
      where: { id: existing.id },
      data,
      select: { id: true, label: true, status: true },
    });
  }
  return db.departmentOperationalCycle.create({
    data,
    select: { id: true, label: true, status: true },
  });
}

async function ensureSchedule(db, employeeId, serviceDate, unitId) {
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
        roleType: "STAFF",
        unitId,
        plannedStart: "05:30",
        plannedEnd: "19:30",
      },
    });
  }
}

async function main() {
  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  const target = assertDisposableDatabaseUrl(url);
  console.log(`job-flow-browser-fixtures: target ${target.databaseName}`);

  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const facility = await db.facility.findFirstOrThrow({
      where: { displayName: "Terrace View Long Term Care" },
      select: { id: true, timezone: true, displayName: true },
    });
    const dietary = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "DIETARY", isActive: true },
      select: { id: true },
    });
    const evs = await db.department.findFirst({
      where: { facilityId: facility.id, key: "EVS", isActive: true },
      select: { id: true },
    });

    const manager = await upsertUser(db, {
      email: "jf.manager@ltc.local",
      displayName: "JF Job Flow Manager",
      roleKey: "MANAGER",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const supervisor = await upsertUser(db, {
      email: "jf.supervisor@ltc.local",
      displayName: "JF Job Flow Supervisor",
      roleKey: "SUPERVISOR",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const staff = await upsertUser(db, {
      email: "jf.staff@ltc.local",
      displayName: "JF Job Flow Staff",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const faWithout = await upsertUser(db, {
      email: "jf.fa.no-dietary@ltc.local",
      displayName: "JF FA Without Dietary",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: null,
    });
    const faWith = await upsertUser(db, {
      email: "jf.fa.dietary@ltc.local",
      displayName: "JF FA With Dietary",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });

    const staffPin = "246801";
    const managerEmployee = await ensureEmployee(db, {
      facilityId: facility.id,
      email: manager.email,
      firstName: "JF",
      lastName: "ManagerEmp",
      dietaryId: dietary.id,
      roleType: "MANAGER",
    });
    await ensureDeptMembership(db, managerEmployee.id, dietary.id);

    const supervisorEmployee = await ensureEmployee(db, {
      facilityId: facility.id,
      email: supervisor.email,
      firstName: "JF",
      lastName: "SupervisorEmp",
      dietaryId: dietary.id,
      roleType: "SUPERVISOR",
    });
    await ensureDeptMembership(db, supervisorEmployee.id, dietary.id);

    const staffEmployee = await ensureEmployee(db, {
      facilityId: facility.id,
      email: staff.email,
      firstName: "JF",
      lastName: "StaffEmp",
      dietaryId: dietary.id,
      pinDigestValue: pinDigest(facility.id, staffPin),
    });
    await ensureDeptMembership(db, staffEmployee.id, dietary.id);

    const unassignedEmployee = await ensureEmployee(db, {
      facilityId: facility.id,
      email: "jf.unassigned@ltc.local",
      firstName: "JF",
      lastName: "UnassignedEmp",
      dietaryId: dietary.id,
    });
    await ensureDeptMembership(db, unassignedEmployee.id, dietary.id);

    const callOffEmployee = await ensureEmployee(db, {
      facilityId: facility.id,
      email: "jf.calloff@ltc.local",
      firstName: "JF",
      lastName: "CallOffEmp",
      dietaryId: dietary.id,
    });
    await ensureDeptMembership(db, callOffEmployee.id, dietary.id);

    const noAssignStaffUser = await upsertUser(db, {
      email: "jf.staff.noassign@ltc.local",
      displayName: "JF Staff No Assignment",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const noAssignEmployee = await ensureEmployee(db, {
      facilityId: facility.id,
      email: noAssignStaffUser.email,
      firstName: "JF",
      lastName: "NoAssignEmp",
      dietaryId: dietary.id,
    });
    await ensureDeptMembership(db, noAssignEmployee.id, dietary.id);

    const serverys = await ensureServeryUnits(db, facility.id, dietary.id, evs?.id ?? null);
    const primaryUnit = serverys.find((u) => u.name === "1A Naval Park") ?? serverys[0];
    const secondaryUnit =
      serverys.find((u) => u.id !== primaryUnit.id && u.name.startsWith("JF Servery")) ??
      serverys.find((u) => u.id !== primaryUnit.id) ??
      serverys[1];
    const uncoveredUnit =
      serverys.find((u) => u.id !== primaryUnit.id && u.id !== secondaryUnit?.id) ?? serverys[2];

    await db.employeeUnitAccess.upsert({
      where: {
        employeeId_unitId: { employeeId: staffEmployee.id, unitId: primaryUnit.id },
      },
      update: {},
      create: { employeeId: staffEmployee.id, unitId: primaryUnit.id },
    });
    await db.employee.update({
      where: { id: staffEmployee.id },
      data: { primaryUnitId: primaryUnit.id },
    });

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const serviceDateKey = `${y}-${m}-${d}`;
    const serviceDate = serviceDateUtc(serviceDateKey);
    const effectiveFrom = serviceDateUtc("2026-01-01");

    // Published Dietary day structure (seeded for speed).
    await ensurePublishedCycle(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      stableKey: "jf_morning_prep",
      label: "Morning Preparation",
      description: "Prepare serverys for breakfast service.",
      cycleType: "PREPARATION",
      displaySequence: 10,
      startLocal: "05:30",
      endLocal: "07:00",
      mealType: "BREAKFAST",
      expectedMilestones: ["READY"],
      effectiveFrom,
    });
    await ensurePublishedCycle(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      stableKey: "jf_breakfast_service",
      label: "Breakfast Service",
      description: null,
      cycleType: "SERVICE",
      displaySequence: 20,
      startLocal: "07:00",
      endLocal: "09:00",
      mealType: "BREAKFAST",
      expectedMilestones: ["READY", "SERVICE_STARTED"],
      effectiveFrom,
    });
    await ensurePublishedCycle(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      stableKey: "jf_lunch_service",
      label: "Lunch Service",
      description: null,
      cycleType: "SERVICE",
      displaySequence: 50,
      startLocal: "11:30",
      endLocal: "13:30",
      mealType: "LUNCH",
      expectedMilestones: ["READY", "SERVICE_STARTED"],
      effectiveFrom,
    });
    await ensurePublishedCycle(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      stableKey: "jf_dinner_service",
      label: "Dinner Service",
      description: null,
      cycleType: "SERVICE",
      displaySequence: 80,
      startLocal: "17:00",
      endLocal: "19:00",
      mealType: "DINNER",
      expectedMilestones: ["READY", "SERVICE_STARTED"],
      effectiveFrom,
    });
    // Retired cycle must not appear prospectively.
    await ensurePublishedCycle(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      stableKey: "jf_retired_ghost",
      label: "Retired Ghost Cycle",
      description: "Should not appear in Runtime.",
      cycleType: "CUSTOM",
      displaySequence: 5,
      startLocal: "04:00",
      endLocal: "05:00",
      mealType: null,
      expectedMilestones: [],
      status: "RETIRED",
      effectiveFrom,
    });
    // Draft left for UI publish path (Closeout).
    await ensurePublishedCycle(db, {
      facilityId: facility.id,
      departmentId: dietary.id,
      stableKey: "jf_evening_closeout_draft",
      label: "Evening Closeout Draft",
      description: "Draft closeout for publish-via-UI path.",
      cycleType: "CLOSEOUT",
      displaySequence: 90,
      startLocal: "19:00",
      endLocal: "20:30",
      mealType: null,
      expectedMilestones: [],
      status: "DRAFT",
      effectiveFrom,
    });

    await ensureSchedule(db, staffEmployee.id, serviceDate, primaryUnit.id);
    await ensureSchedule(db, unassignedEmployee.id, serviceDate, primaryUnit.id);
    await ensureSchedule(db, callOffEmployee.id, serviceDate, primaryUnit.id);
    await ensureSchedule(db, noAssignEmployee.id, serviceDate, primaryUnit.id);

    const callOffExists = await db.assignmentOverride.findFirst({
      where: { employeeId: callOffEmployee.id, date: serviceDate },
      select: { id: true },
    });
    if (!callOffExists) {
      await db.assignmentOverride.create({
        data: {
          date: serviceDate,
          employeeId: callOffEmployee.id,
          newUnitId: primaryUnit.id,
          reason: "[call-down:call-off] Job Flow browser synthetic call-off",
        },
      });
    }

    const plan = await db.operationalAssignmentPlan.upsert({
      where: {
        facilityId_departmentId_serviceDate: {
          facilityId: facility.id,
          departmentId: dietary.id,
          serviceDate,
        },
      },
      update: { status: "CONFIRMED", confirmedAt: new Date() },
      create: {
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
        employeeId: { in: [staffEmployee.id, callOffEmployee.id] },
      },
    });

    const staffAssignment = await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        planId: plan.id,
        employeeId: staffEmployee.id,
        serviceDate,
        roleKey: "SERVER",
        roleLabel: "Server",
        unitId: primaryUnit.id,
        startsAt: null,
        endsAt: null,
        status: "PLANNED",
        source: "SCHEDULED_EMPLOYEE",
      },
      select: { id: true },
    });

    // Non-frontline draft-style row (no plan) must never appear in Job Flow.
    await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        planId: null,
        employeeId: staffEmployee.id,
        serviceDate,
        roleKey: "DRAFT_ONLY",
        roleLabel: "Draft Only Duty",
        unitId: primaryUnit.id,
        startsAt: null,
        endsAt: null,
        status: "PLANNED",
        source: "MANUAL",
      },
    });

    // Coverage template: require uncovered unit so board shows Uncovered.
    let template = await db.operationalAssignmentTemplate.findFirst({
      where: {
        facilityId: facility.id,
        departmentId: dietary.id,
        name: "Phase 9B Job Flow Coverage",
      },
      select: { id: true },
    });
    if (!template) {
      template = await db.operationalAssignmentTemplate.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          name: "Phase 9B Job Flow Coverage",
          description: "Synthetic coverage for Operations Board exceptions",
          isActive: true,
          items: {
            create: [
              {
                roleKey: "SERVER",
                roleLabel: "Server",
                requiredCount: 1,
                unitId: primaryUnit.id,
                sortOrder: 1,
              },
              {
                roleKey: "SERVER",
                roleLabel: "Server",
                requiredCount: 1,
                unitId: uncoveredUnit.id,
                sortOrder: 2,
              },
            ],
          },
        },
        select: { id: true },
      });
    }

    // Seed Ready + late Started on primary unit for LUNCH (Supervisor timing exception when cycle applies).
    const readyAt = new Date(Date.UTC(y, Number(m) - 1, Number(d), 15, 30, 0));
    const startedAt = new Date(Date.UTC(y, Number(m) - 1, Number(d), 17, 5, 0));
    const event = await db.serveryMealServiceEvent.upsert({
      where: {
        unitId_serviceDate_mealType: {
          unitId: primaryUnit.id,
          serviceDate,
          mealType: "LUNCH",
        },
      },
      update: {
        mealServiceReadyAt: readyAt,
        mealServiceStartedAt: startedAt,
        readyRecordedAt: readyAt,
        startedRecordedAt: startedAt,
      },
      create: {
        unitId: primaryUnit.id,
        serviceDate,
        mealType: "LUNCH",
        mealServiceReadyAt: readyAt,
        mealServiceStartedAt: startedAt,
        readyRecordedAt: readyAt,
        startedRecordedAt: startedAt,
      },
      select: { id: true },
    });
    const readyExists = await db.serveryMilestoneEntry.findFirst({
      where: { eventId: event.id, milestone: "READY" },
      select: { id: true },
    });
    if (!readyExists) {
      await db.serveryMilestoneEntry.create({
        data: {
          eventId: event.id,
          milestone: "READY",
          occurredAt: readyAt,
          clientActionId: "jf-browser-ready-lunch",
        },
      });
    }
    const startedExists = await db.serveryMilestoneEntry.findFirst({
      where: { eventId: event.id, milestone: "SERVICE_STARTED" },
      select: { id: true },
    });
    if (!startedExists) {
      await db.serveryMilestoneEntry.create({
        data: {
          eventId: event.id,
          milestone: "SERVICE_STARTED",
          occurredAt: startedAt,
          clientActionId: "jf-browser-started-lunch",
        },
      });
    }

    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    writeFileSync(
      FIXTURE_PATH,
      JSON.stringify(
        {
          facilityId: facility.id,
          facilityName: facility.displayName,
          facilityTimezone: facility.timezone || "America/New_York",
          departmentId: dietary.id,
          unitId: primaryUnit.id,
          unitName: primaryUnit.name,
          secondaryUnitId: secondaryUnit?.id ?? null,
          secondaryUnitName: secondaryUnit?.name ?? null,
          uncoveredUnitId: uncoveredUnit.id,
          uncoveredUnitName: uncoveredUnit.name,
          serveryCount: serverys.length,
          serveryUnitIds: serverys.map((u) => u.id),
          serviceDateKey,
          managerEmail: manager.email,
          supervisorEmail: supervisor.email,
          staffEmail: staff.email,
          staffNoAssignEmail: noAssignStaffUser.email,
          faWithoutDietaryEmail: faWithout.email,
          faWithDietaryEmail: faWith.email,
          staffEmployeeId: staffEmployee.id,
          staffAssignmentId: staffAssignment.id,
          unassignedEmployeeId: unassignedEmployee.id,
          callOffEmployeeId: callOffEmployee.id,
          noAssignEmployeeId: noAssignEmployee.id,
          templateId: template.id,
          draftCycleLabel: "Evening Closeout Draft",
          retiredCycleLabel: "Retired Ghost Cycle",
          builderCyclesPath: `/admin/departments/${dietary.id}?tab=cycles`,
          unitWorkspacePath: `/unit/${primaryUnit.id}`,
          operationsBoardPath: "/staffing/operations",
          assignmentBoardPath: `/staffing/assignments?departmentId=${dietary.id}`,
          staffPinHint: "env:JOB_FLOW_BROWSER_STAFF_PIN",
          passwordEnv: "SEED_DEMO_PASSWORD",
        },
        null,
        2,
      ),
    );
    writeFileSync(PINS_PATH, `JOB_FLOW_BROWSER_STAFF_PIN=${staffPin}\n`, { mode: 0o600 });
    console.log("job-flow-browser-fixtures: wrote fixtures (no secrets in fixtures.json)");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(`job-flow-browser-fixtures: FAIL — ${err?.message || err}`);
  process.exit(1);
});
