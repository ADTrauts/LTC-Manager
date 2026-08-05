#!/usr/bin/env node
/**
 * Deterministic synthetic fixtures for Phase 6A offline browser certification.
 * Uses the disposable VERIFY_DATABASE_URL only. Never prints credentials.
 */
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_PATH =
  process.env.OFFLINE_BROWSER_FIXTURE_PATH ||
  join(ROOT, "tmp", "offline-browser-artifacts", "fixtures.json");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
if (!SYNTHETIC_PASSWORD) {
  console.error("offline-browser-fixtures: SEED_DEMO_PASSWORD is required");
  process.exit(1);
}

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  console.error("offline-browser-fixtures: AUTH_SECRET is required");
  process.exit(1);
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

async function main() {
  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  const target = assertDisposableDatabaseUrl(url);
  console.log(`offline-browser-fixtures: target ${target.databaseName}`);

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

    const servery = await db.unit.findFirstOrThrow({
      where: {
        facilityId: facility.id,
        name: "1A Naval Park",
        unitType: "SERVERY",
        isActive: true,
      },
      select: { id: true, name: true },
    });

    let secondUnit = await db.unit.findFirst({
      where: {
        facilityId: facility.id,
        unitType: "SERVERY",
        isActive: true,
        id: { not: servery.id },
      },
      select: { id: true, name: true },
    });
    if (!secondUnit) {
      secondUnit = await db.unit.create({
        data: {
          facilityId: facility.id,
          name: "Offline Browser Servery B",
          unitType: "SERVERY",
          isActive: true,
          displayOrder: 90,
          mealTimes: {
            create: [
              { mealType: "BREAKFAST", scheduledTime: "07:45", isActive: true },
              { mealType: "LUNCH", scheduledTime: "12:00", isActive: true },
              { mealType: "DINNER", scheduledTime: "17:00", isActive: true },
            ],
          },
        },
        select: { id: true, name: true },
      });
    }

    const admin = await db.user.findUniqueOrThrow({
      where: { email: "admin@terraceview.local" },
      select: { id: true, email: true, sessionVersion: true, primaryDepartmentId: true },
    });

    const supervisor = await upsertUser(db, {
      email: "supervisor.offline@terraceview.local",
      displayName: "Offline Browser Supervisor",
      roleKey: "SUPERVISOR",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });

    const staffUser = await upsertUser(db, {
      email: "staff.offline@terraceview.local",
      displayName: "Offline Browser Staff",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });

    const lead = await upsertUser(db, {
      email: "lead.offline@terraceview.local",
      displayName: "Offline Browser Lead",
      roleKey: "LEAD_TEAM_MEMBER",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });

    const manager = await upsertUser(db, {
      email: "manager.offline@terraceview.local",
      displayName: "Offline Browser Manager",
      roleKey: "MANAGER",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });

    const faNoDiet = await upsertUser(db, {
      email: "fa.nodiet.offline@terraceview.local",
      displayName: "Offline Browser FA No Diet",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: null,
    });

    const staffPin = "246813";
    const staffEmployee = await db.employee.upsert({
      where: { id: "offline-browser-staff" },
      update: {
        facilityId: facility.id,
        firstName: "Offline",
        lastName: "StaffPin",
        roleType: "STAFF",
        status: "ACTIVE",
        primaryDepartmentId: dietary.id,
        primaryUnitId: servery.id,
        pinDigest: pinDigest(facility.id, staffPin),
        sessionVersion: 0,
      },
      create: {
        id: "offline-browser-staff",
        facilityId: facility.id,
        firstName: "Offline",
        lastName: "StaffPin",
        roleType: "STAFF",
        status: "ACTIVE",
        primaryDepartmentId: dietary.id,
        primaryUnitId: servery.id,
        pinDigest: pinDigest(facility.id, staffPin),
      },
      select: { id: true },
    });

    await db.employeeUnitAccess.upsert({
      where: {
        employeeId_unitId: { employeeId: staffEmployee.id, unitId: servery.id },
      },
      update: {},
      create: { employeeId: staffEmployee.id, unitId: servery.id },
    });

    const supervisorEmployee = await db.employee.upsert({
      where: { id: "offline-browser-supervisor" },
      update: {
        facilityId: facility.id,
        firstName: "Offline",
        lastName: "SupervisorPin",
        roleType: "SUPERVISOR",
        status: "ACTIVE",
        primaryDepartmentId: dietary.id,
        pinDigest: pinDigest(facility.id, "135790"),
        sessionVersion: 0,
      },
      create: {
        id: "offline-browser-supervisor",
        facilityId: facility.id,
        firstName: "Offline",
        lastName: "SupervisorPin",
        roleType: "SUPERVISOR",
        status: "ACTIVE",
        primaryDepartmentId: dietary.id,
        pinDigest: pinDigest(facility.id, "135790"),
      },
      select: { id: true },
    });

    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    const payload = {
      facilityId: facility.id,
      facilityName: facility.displayName,
      facilityTimezone: facility.timezone || "America/New_York",
      dietaryDepartmentId: dietary.id,
      serveryUnitId: servery.id,
      serveryUnitName: servery.name,
      secondUnitId: secondUnit.id,
      secondUnitName: secondUnit.name,
      adminEmail: admin.email,
      adminUserId: admin.id,
      supervisorEmail: supervisor.email,
      supervisorUserId: supervisor.id,
      staffEmail: staffUser.email,
      staffUserId: staffUser.id,
      leadEmail: lead.email,
      leadUserId: lead.id,
      managerEmail: manager.email,
      managerUserId: manager.id,
      faNoDietEmail: faNoDiet.email,
      faNoDietUserId: faNoDiet.id,
      staffEmployeeId: staffEmployee.id,
      supervisorEmployeeId: supervisorEmployee.id,
      // PINs are synthetic test values; password comes only from SEED_DEMO_PASSWORD env.
      staffPinHint: "env:OFFLINE_BROWSER_STAFF_PIN",
      passwordEnv: "SEED_DEMO_PASSWORD",
    };
    writeFileSync(FIXTURE_PATH, JSON.stringify(payload, null, 2));
    // Export PIN for tests via env file without logging it.
    writeFileSync(
      join(dirname(FIXTURE_PATH), "pins.env"),
      `OFFLINE_BROWSER_STAFF_PIN=${staffPin}\nOFFLINE_BROWSER_SUPERVISOR_PIN=135790\n`,
      { mode: 0o600 },
    );
    console.log(`offline-browser-fixtures: wrote ${FIXTURE_PATH}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(`offline-browser-fixtures: FAIL — ${String(err?.message || err)}`);
  process.exit(1);
});
