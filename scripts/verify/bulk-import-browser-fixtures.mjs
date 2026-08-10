#!/usr/bin/env node
/**
 * Bulk onboarding import browser fixtures (synthetic names only).
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
  process.env.BULK_IMPORT_BROWSER_ARTIFACT_DIR_NAME || "bulk-import-browser-artifacts",
);
const FIXTURE_PATH =
  process.env.BULK_IMPORT_BROWSER_FIXTURE_PATH || join(ARTIFACT_DIR, "fixtures.json");
const PINS_PATH = join(ARTIFACT_DIR, "pins.env");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
const AUTH_SECRET = process.env.AUTH_SECRET;

function fail(message) {
  console.error(`bulk-import-browser-fixtures: FAIL — ${message}`);
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
  if (!SYNTHETIC_PASSWORD) fail("SEED_DEMO_PASSWORD is required");
  if (!AUTH_SECRET) fail("AUTH_SECRET is required");
  const url = process.env.VERIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) fail("VERIFY_DATABASE_URL is required");
  assertDisposableDatabaseUrl(url);

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const facility = await db.facility.findFirst({ orderBy: { createdAt: "asc" } });
    if (!facility) fail("no facility");
    const dietary = await db.department.findFirst({
      where: { facilityId: facility.id, key: "DIETARY", isActive: true },
    });
    if (!dietary) fail("Dietary department required");

    const manager = await upsertUser(db, {
      email: "bulk.import.manager@ltc.local",
      displayName: "Bulk Import Manager",
      roleKey: "MANAGER",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const fa = await upsertUser(db, {
      email: "bulk.import.fa@ltc.local",
      displayName: "Bulk Import FA",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const staffUser = await upsertUser(db, {
      email: "bulk.import.staff@ltc.local",
      displayName: "Bulk Import Staff",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });

    const staffPin = "2468";
    let employee = await db.employee.findFirst({
      where: { facilityId: facility.id, email: "bulk.import.pin@ltc.local" },
    });
    if (!employee) {
      employee = await db.employee.create({
        data: {
          facilityId: facility.id,
          email: "bulk.import.pin@ltc.local",
          firstName: "Bulk",
          lastName: "PinStaff",
          roleType: "STAFF",
          status: "ACTIVE",
          employmentType: "FULL_TIME",
          pinDigest: pinDigest(facility.id, staffPin),
          primaryDepartmentId: dietary.id,
        },
      });
    } else {
      employee = await db.employee.update({
        where: { id: employee.id },
        data: {
          pinDigest: pinDigest(facility.id, staffPin),
          status: "ACTIVE",
          primaryDepartmentId: dietary.id,
        },
      });
    }

    const fixtures = {
      facilityId: facility.id,
      facilityName: facility.displayName,
      dietaryDepartmentId: dietary.id,
      managerEmail: manager.email,
      faEmail: fa.email,
      staffEmail: staffUser.email,
      pinEmployeeEmail: employee.email,
      facilityBuilderPath: "/admin/facility/builder",
      assetBuilderPath: "/assets/builder",
    };

    writeFileSync(FIXTURE_PATH, JSON.stringify(fixtures, null, 2));
    writeFileSync(
      PINS_PATH,
      [`BULK_IMPORT_STAFF_PIN=${staffPin}`, `SEED_DEMO_PASSWORD=${SYNTHETIC_PASSWORD}`].join("\n") +
        "\n",
    );
    console.log(`bulk-import-browser-fixtures: wrote ${FIXTURE_PATH}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
