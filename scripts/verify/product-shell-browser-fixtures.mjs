#!/usr/bin/env node
/**
 * Phase 13 Product Shell (Build/Run IA) browser fixtures (synthetic names only, no PHI).
 * Disposable VERIFY_DATABASE_URL only.
 *
 * Seeds users across the authority spectrum so the shell scenarios can assert that RUN / BUILD /
 * ADMIN navigation follows authority (never becomes authorization), and a Quick PIN frontline
 * employee that must remain RUN-only.
 */
import { createHmac } from "node:crypto";
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
  process.env.PRODUCT_SHELL_BROWSER_ARTIFACT_DIR_NAME || "product-shell-browser-artifacts",
);
const FIXTURE_PATH =
  process.env.PRODUCT_SHELL_BROWSER_FIXTURE_PATH || join(ARTIFACT_DIR, "fixtures.json");
const PINS_PATH = join(ARTIFACT_DIR, "pins.env");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
const AUTH_SECRET = process.env.AUTH_SECRET;

function fail(message) {
  console.error(`product-shell-browser-fixtures: FAIL — ${message}`);
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

async function ensureEmployee(db, {
  facilityId,
  email,
  firstName,
  lastName,
  departmentId,
  extraDepartmentIds = [],
  roleType = "STAFF",
  pinDigestValue = null,
}) {
  const existing = await db.employee.findFirst({
    where: { facilityId, email },
    select: { id: true },
  });
  const emp = existing
    ? await db.employee.update({
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
      })
    : await db.employee.create({
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

  for (const deptId of [departmentId, ...extraDepartmentIds]) {
    if (!deptId) continue;
    await db.employeeDepartment.upsert({
      where: { employeeId_departmentId: { employeeId: emp.id, departmentId: deptId } },
      update: {},
      create: { employeeId: emp.id, departmentId: deptId },
    });
  }
  return emp;
}

async function main() {
  if (!SYNTHETIC_PASSWORD) fail("SEED_DEMO_PASSWORD is required");
  if (!AUTH_SECRET) fail("AUTH_SECRET is required");

  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) fail("VERIFY_DATABASE_URL is required");
  const target = assertDisposableDatabaseUrl(url);
  console.log(`product-shell-browser-fixtures: target ${target.databaseName}`);

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const db = new PrismaClient({ datasources: { db: { url } } });

  try {
    const facility = await db.facility.findFirstOrThrow({
      where: { displayName: "Terrace View Long Term Care" },
      select: { id: true, displayName: true },
    });
    const dietary = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "DIETARY", isActive: true },
      select: { id: true, name: true },
    });
    const evs = await db.department.findFirstOrThrow({
      where: { facilityId: facility.id, key: "EVS", isActive: true },
      select: { id: true, name: true },
    });

    // Ensure both departments are pickable in the shell department switcher.
    await db.department.updateMany({
      where: { id: { in: [dietary.id, evs.id] } },
      data: { showInEmployeeApp: true },
    });

    const manager = await upsertUser(db, {
      email: "shell.manager@ltc.local",
      displayName: "Shell Browser Manager",
      roleKey: "MANAGER",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const supervisor = await upsertUser(db, {
      email: "shell.supervisor@ltc.local",
      displayName: "Shell Browser Supervisor",
      roleKey: "SUPERVISOR",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const fa = await upsertUser(db, {
      email: "shell.fa@ltc.local",
      displayName: "Shell Browser Facility Admin",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: null,
    });

    // Manager is also an employee in Dietary + EVS so the department switch has ≥2 options.
    await ensureEmployee(db, {
      facilityId: facility.id,
      email: manager.email,
      firstName: "Shell",
      lastName: "ManagerEmp",
      departmentId: dietary.id,
      extraDepartmentIds: [evs.id],
      roleType: "MANAGER",
    });

    // Quick PIN frontline Dietary staff (must remain RUN-only).
    const staffPin = "531642";
    const staff = await upsertUser(db, {
      email: "shell.staff@ltc.local",
      displayName: "Shell Browser Staff",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const staffEmp = await ensureEmployee(db, {
      facilityId: facility.id,
      email: staff.email,
      firstName: "Shell",
      lastName: "StaffOne",
      departmentId: dietary.id,
      roleType: "STAFF",
      pinDigestValue: pinDigest(facility.id, staffPin),
    });

    // A unit to bind the shared tablet device to (any active dietary/servery unit).
    const unit =
      (await db.unit.findFirst({
        where: { facilityId: facility.id, unitType: "SERVERY", isActive: true },
        select: { id: true, name: true },
      })) ??
      (await db.unit.findFirstOrThrow({
        where: { facilityId: facility.id, isActive: true },
        select: { id: true, name: true },
      }));

    const fixtures = {
      facilityId: facility.id,
      facilityName: facility.displayName,
      dietaryDepartmentId: dietary.id,
      evsDepartmentId: evs.id,
      unitId: unit.id,
      unitName: unit.name,
      staffEmployeeId: staffEmp.id,
      users: {
        manager: { email: manager.email, password: SYNTHETIC_PASSWORD },
        supervisor: { email: supervisor.email, password: SYNTHETIC_PASSWORD },
        fa: { email: fa.email, password: SYNTHETIC_PASSWORD },
        staff: { email: staff.email, password: SYNTHETIC_PASSWORD },
      },
    };

    writeFileSync(FIXTURE_PATH, JSON.stringify(fixtures, null, 2));
    writeFileSync(
      PINS_PATH,
      [`PRODUCT_SHELL_STAFF_PIN=${staffPin}`, `SEED_DEMO_PASSWORD=${SYNTHETIC_PASSWORD}`].join("\n"),
    );
    console.log(`product-shell-browser-fixtures: wrote ${FIXTURE_PATH}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
