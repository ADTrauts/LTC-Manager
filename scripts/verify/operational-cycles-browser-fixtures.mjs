#!/usr/bin/env node
/**
 * Synthetic fixtures for Phase 9A Operational Cycles browser certification.
 * Disposable VERIFY_DATABASE_URL only. Never prints credentials.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_PATH =
  process.env.OPERATIONAL_CYCLES_BROWSER_FIXTURE_PATH ||
  join(ROOT, "tmp", "operational-cycles-browser-artifacts", "fixtures.json");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
if (!SYNTHETIC_PASSWORD) {
  console.error("operational-cycles-browser-fixtures: SEED_DEMO_PASSWORD is required");
  process.exit(1);
}

/** Target servery count in the 8–17 band for supervisor multi-unit overview. */
const TARGET_SERVERY_COUNT = 12;

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
  dietaryId,
  roleType = "STAFF",
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

function minutesToHhMm(totalMinutes) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
    const name = `OC Servery ${String(nextIndex).padStart(2, "0")}`;
    nextIndex += 1;
    if (units.some((u) => u.name === name)) continue;
    const created = await db.unit.create({
      data: {
        facilityId,
        name,
        unitType: "SERVERY",
        displayOrder: 100 + units.length,
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

async function main() {
  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  const target = assertDisposableDatabaseUrl(url);
  console.log(`operational-cycles-browser-fixtures: target ${target.databaseName}`);

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
      email: "oc.manager@ltc.local",
      displayName: "OC Cycles Manager",
      roleKey: "MANAGER",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const supervisor = await upsertUser(db, {
      email: "oc.supervisor@ltc.local",
      displayName: "OC Cycles Supervisor",
      roleKey: "SUPERVISOR",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const staff = await upsertUser(db, {
      email: "oc.staff@ltc.local",
      displayName: "OC Cycles Staff",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const faWithout = await upsertUser(db, {
      email: "oc.fa.no-dietary@ltc.local",
      displayName: "OC FA Without Dietary",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: null,
    });
    const faWith = await upsertUser(db, {
      email: "oc.fa.dietary@ltc.local",
      displayName: "OC FA With Dietary",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });

    const managerEmployee = await ensureEmployee(db, {
      facilityId: facility.id,
      email: manager.email,
      firstName: "OC",
      lastName: "ManagerEmp",
      dietaryId: dietary.id,
      roleType: "MANAGER",
    });
    await ensureDeptMembership(db, managerEmployee.id, dietary.id);

    const supervisorEmployee = await ensureEmployee(db, {
      facilityId: facility.id,
      email: supervisor.email,
      firstName: "OC",
      lastName: "SupervisorEmp",
      dietaryId: dietary.id,
      roleType: "SUPERVISOR",
    });
    await ensureDeptMembership(db, supervisorEmployee.id, dietary.id);

    const staffEmployee = await ensureEmployee(db, {
      facilityId: facility.id,
      email: staff.email,
      firstName: "OC",
      lastName: "StaffEmp",
      dietaryId: dietary.id,
    });
    await ensureDeptMembership(db, staffEmployee.id, dietary.id);

    const serverys = await ensureServeryUnits(db, facility.id, dietary.id, evs?.id ?? null);
    const primaryUnit = serverys.find((u) => u.name === "1A Naval Park") ?? serverys[0];

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
        employeeId: staffEmployee.id,
        serviceDate,
      },
    });
    await db.operationalAssignment.create({
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
    });

    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    writeFileSync(
      FIXTURE_PATH,
      JSON.stringify(
        {
          facilityId: facility.id,
          facilityName: facility.displayName,
          departmentId: dietary.id,
          unitId: primaryUnit.id,
          unitName: primaryUnit.name,
          serveryCount: serverys.length,
          serveryUnitIds: serverys.map((u) => u.id),
          serviceDateKey,
          managerEmail: manager.email,
          supervisorEmail: supervisor.email,
          staffEmail: staff.email,
          faWithoutDietaryEmail: faWithout.email,
          faWithDietaryEmail: faWith.email,
          staffEmployeeId: staffEmployee.id,
          builderCyclesPath: `/admin/departments/${dietary.id}?tab=cycles`,
          unitWorkspacePath: `/unit/${primaryUnit.id}`,
          supervisorCyclesPath: "/staffing/cycles",
        },
        null,
        2,
      ),
    );
    console.log("operational-cycles-browser-fixtures: wrote fixtures (no secrets)");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(`operational-cycles-browser-fixtures: FAIL — ${err?.message || err}`);
  process.exit(1);
});
