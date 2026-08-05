#!/usr/bin/env node
/**
 * Synthetic fixtures for Dietary V1 integrated pilot certification.
 * Disposable VERIFY_DATABASE_URL only. Never prints credentials.
 */
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARTIFACT_DIR = join(ROOT, "tmp", "dietary-pilot-artifacts");
const FIXTURE_PATH =
  process.env.DIETARY_PILOT_FIXTURE_PATH || join(ARTIFACT_DIR, "fixtures.json");
const PINS_PATH = join(ARTIFACT_DIR, "pins.env");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!SYNTHETIC_PASSWORD || !AUTH_SECRET) {
  console.error("dietary-pilot-fixtures: SEED_DEMO_PASSWORD and AUTH_SECRET are required");
  process.exit(1);
}

function serviceDateUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function pinDigest(facilityId, pin) {
  return createHmac("sha256", AUTH_SECRET).update(`${facilityId}:${pin.trim()}`).digest("hex");
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

async function ensureEmployee(db, input) {
  const existing = await db.employee.findFirst({
    where: { facilityId: input.facilityId, email: input.email },
    select: { id: true },
  });
  const data = {
    firstName: input.firstName,
    lastName: input.lastName,
    status: "ACTIVE",
    primaryDepartmentId: input.dietaryId,
    roleType: input.roleType ?? "STAFF",
    primaryUnitId: input.primaryUnitId ?? null,
    pinDigest: input.pinDigest ?? undefined,
    sessionVersion: 0,
  };
  if (existing) {
    return db.employee.update({ where: { id: existing.id }, data, select: { id: true } });
  }
  return db.employee.create({
    data: {
      facilityId: input.facilityId,
      email: input.email,
      ...data,
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

async function main() {
  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  const target = assertDisposableDatabaseUrl(url);
  console.log(`dietary-pilot-fixtures: target ${target.databaseName}`);

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

    // Prefer existing seed serverys; create synthetic ones up to ~17.
    let serverys = await db.unit.findMany({
      where: { facilityId: facility.id, unitType: "SERVERY", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 17,
    });
    while (serverys.length < 17) {
      const n = String(serverys.length + 1).padStart(2, "0");
      const created = await db.unit.create({
        data: {
          facilityId: facility.id,
          name: `Pilot Servery ${n}`,
          unitType: "SERVERY",
          isActive: true,
          displayOrder: 900 + serverys.length,
        },
        select: { id: true, name: true },
      });
      for (const meal of [
        { mealType: "BREAKFAST", scheduledTime: "08:00" },
        { mealType: "LUNCH", scheduledTime: "12:00" },
        { mealType: "DINNER", scheduledTime: "17:00" },
      ]) {
        await db.unitMealTime.upsert({
          where: { unitId_mealType: { unitId: created.id, mealType: meal.mealType } },
          update: { scheduledTime: meal.scheduledTime },
          create: { unitId: created.id, mealType: meal.mealType, scheduledTime: meal.scheduledTime },
        });
      }
      serverys.push(created);
    }
    const primaryServery = serverys[0];

    const supervisor = await upsertUser(db, {
      email: "pilot.supervisor@ltc.local",
      displayName: "Pilot Supervisor",
      roleKey: "SUPERVISOR",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const gm = await upsertUser(db, {
      email: "pilot.gm@ltc.local",
      displayName: "Pilot GM",
      roleKey: "GM",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const staff = await upsertUser(db, {
      email: "pilot.staff@ltc.local",
      displayName: "Pilot Staff",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const admin = await upsertUser(db, {
      email: "pilot.admin@ltc.local",
      displayName: "Pilot Admin",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: null,
    });

    const staffPin = "864201";
    const supervisorEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: supervisor.email,
      firstName: "Pilot",
      lastName: "SupervisorEmp",
      dietaryId: dietary.id,
      roleType: "SUPERVISOR",
    });
    await ensureDeptMembership(db, supervisorEmp.id, dietary.id);

    const staffEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: staff.email,
      firstName: "Pilot",
      lastName: "StaffEmp",
      dietaryId: dietary.id,
      primaryUnitId: primaryServery.id,
      pinDigest: pinDigest(facility.id, staffPin),
    });
    await ensureDeptMembership(db, staffEmp.id, dietary.id);
    await db.employeeUnitAccess.upsert({
      where: { employeeId_unitId: { employeeId: staffEmp.id, unitId: primaryServery.id } },
      update: {},
      create: { employeeId: staffEmp.id, unitId: primaryServery.id },
    });

    const gmEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: gm.email,
      firstName: "Pilot",
      lastName: "GmEmp",
      dietaryId: dietary.id,
      roleType: "GM",
    });
    await ensureDeptMembership(db, gmEmp.id, dietary.id);

    // ~100 scale employees + schedule slice.
    const scaleIds = [];
    for (let i = 0; i < 100; i++) {
      const n = String(i + 1).padStart(3, "0");
      const emp = await ensureEmployee(db, {
        facilityId: facility.id,
        email: `pilot.scale.${n}@ltc.local`,
        firstName: `PilotScale${n}`,
        lastName: "Dietary",
        dietaryId: dietary.id,
      });
      await ensureDeptMembership(db, emp.id, dietary.id);
      scaleIds.push(emp.id);
    }

    const today = new Date();
    const serviceDateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const serviceDate = serviceDateUtc(serviceDateKey);

    const scheduledIds = [staffEmp.id, ...scaleIds.slice(0, 50)];
    for (const employeeId of scheduledIds) {
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
            unitId: primaryServery.id,
            plannedStart: "05:30",
            plannedEnd: "19:30",
          },
        });
      }
    }

    // Seven call-offs (AssignmentOverride as call-down).
    const callOffIds = scaleIds.slice(0, 7);
    for (const employeeId of callOffIds) {
      const exists = await db.assignmentOverride.findFirst({
        where: { employeeId, date: serviceDate },
        select: { id: true },
      });
      if (!exists) {
        await db.assignmentOverride.create({
          data: {
            date: serviceDate,
            employeeId,
            newUnitId: primaryServery.id,
            reason: "[call-down:call-off] Pilot call-off (synthetic)",
          },
        });
      }
    }

    let template = await db.operationalAssignmentTemplate.findFirst({
      where: {
        facilityId: facility.id,
        departmentId: dietary.id,
        name: "Dietary Pilot Coverage",
      },
      select: { id: true },
    });
    if (!template) {
      template = await db.operationalAssignmentTemplate.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          name: "Dietary Pilot Coverage",
          isActive: true,
          items: {
            create: serverys.slice(0, 5).map((u, i) => ({
              roleKey: "SERVER",
              roleLabel: "Server",
              requiredCount: 1,
              unitId: u.id,
              sortOrder: i + 1,
            })),
          },
        },
        select: { id: true },
      });
    }

    mkdirSync(ARTIFACT_DIR, { recursive: true });
    writeFileSync(
      FIXTURE_PATH,
      JSON.stringify(
        {
          facilityId: facility.id,
          facilityName: facility.displayName,
          facilityTimezone: facility.timezone || "America/New_York",
          departmentId: dietary.id,
          serviceDateKey,
          serveryUnitId: primaryServery.id,
          serveryUnitName: primaryServery.name,
          serveryCount: serverys.length,
          supervisorEmail: supervisor.email,
          gmEmail: gm.email,
          staffEmail: staff.email,
          adminEmail: admin.email,
          staffEmployeeId: staffEmp.id,
          scaleEmployeeCount: 100,
          callOffCount: callOffIds.length,
          templateId: template.id,
        },
        null,
        2,
      ),
    );
    writeFileSync(PINS_PATH, `PILOT_STAFF_PIN=${staffPin}\n`, { mode: 0o600 });
    console.log("dietary-pilot-fixtures: wrote fixtures (no secrets in fixtures.json)");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(`dietary-pilot-fixtures: FAIL — ${err?.message || err}`);
  process.exit(1);
});
