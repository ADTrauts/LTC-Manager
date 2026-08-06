#!/usr/bin/env node
/**
 * Production-safe pilot bootstrap: create the minimum Facility Administrator authority.
 *
 * Creates Organization + Facility + FACILITY_ADMINISTRATOR User (password only).
 * Does not create demo users, Quick PINs, Employees, or sample operational data.
 *
 * Refuses:
 *   - database name ltc_manager
 *   - missing/weak operator inputs
 *   - default demo passwords
 *   - blind re-run when a Facility Administrator already exists (unless FORCE)
 *
 * Usage (never commit secrets):
 *   BOOTSTRAP_DATABASE_URL='postgresql://…/ltc_pilot_…' \
 *   AUTH_SECRET='…' \
 *   FACILITY_DISPLAY_NAME='Terrace View' \
 *   FACILITY_TIMEZONE='America/New_York' \
 *   FA_EMAIL='admin@example.com' \
 *   FA_PASSWORD='…' \
 *   FA_DISPLAY_NAME='Facility Administrator' \
 *   npm run db:bootstrap-pilot-admin
 *
 * Optional: FACILITY_MANAGEMENT_COMPANY, FA_FIRST_NAME, FA_LAST_NAME,
 *           BOOTSTRAP_MARK_ONBOARDING_COMPLETE=1,
 *           BOOTSTRAP_FORCE=1 (re-run on nonempty DB — still refuses duplicate FA email)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, RoleKey } from "@prisma/client";

import {
  FORBIDDEN_DATABASE_NAMES,
  parseDatabaseName,
  redactDatabaseUrl,
} from "./verify/lib/database-target.mjs";
import { applyLogTemplatePresets } from "../prisma/apply-log-template-presets.mjs";
import { upsertDefaultDepartments } from "../prisma/ensure-departments.mjs";

const UNSAFE_PASSWORDS = new Set([
  "changemenow123!",
  "password",
  "password123",
  "admin",
  "admin123",
  "ciseedpassword!changeme",
]);

function loadEnvFile() {
  try {
    const p = resolve(process.cwd(), ".env");
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* no .env */
  }
}

function fail(message) {
  console.error(`bootstrap-pilot-admin: FAIL — ${message}`);
  process.exit(1);
}

function assertSafePassword(password) {
  if (!password || password.length < 12) {
    fail("FA_PASSWORD must be at least 12 characters.");
  }
  if (UNSAFE_PASSWORDS.has(password.trim().toLowerCase())) {
    fail("FA_PASSWORD matches a refused unsafe default.");
  }
}

loadEnvFile();

async function main() {
  const url = process.env.BOOTSTRAP_DATABASE_URL || process.env.DATABASE_URL;
  if (!url?.trim()) {
    fail("BOOTSTRAP_DATABASE_URL (or DATABASE_URL) is required.");
  }

  const databaseName = parseDatabaseName(url);
  if (!databaseName) fail("Database URL could not be parsed.");
  if (FORBIDDEN_DATABASE_NAMES.has(databaseName)) {
    fail("Database name ltc_manager is forbidden. Never bootstrap the local developer database.");
  }

  if (!process.env.AUTH_SECRET?.trim()) {
    fail("AUTH_SECRET is required (same secret the application will use).");
  }
  if (process.env.AUTH_SECRET.trim().length < 32) {
    fail("AUTH_SECRET must be at least 32 characters for pilot production.");
  }

  const facilityName = (process.env.FACILITY_DISPLAY_NAME ?? "").trim();
  const managementCompany = (process.env.FACILITY_MANAGEMENT_COMPANY ?? "").trim() || null;
  const timezone = (process.env.FACILITY_TIMEZONE ?? "America/New_York").trim();
  const faEmail = (process.env.FA_EMAIL ?? "").trim().toLowerCase();
  const faPassword = process.env.FA_PASSWORD ?? "";
  const faDisplayName = (process.env.FA_DISPLAY_NAME ?? "Facility Administrator").trim();
  const firstName = (process.env.FA_FIRST_NAME ?? "Facility").trim();
  const lastName = (process.env.FA_LAST_NAME ?? "Administrator").trim();
  const markOnboardingComplete = process.env.BOOTSTRAP_MARK_ONBOARDING_COMPLETE === "1";
  const force = process.env.BOOTSTRAP_FORCE === "1";

  if (facilityName.length < 2) fail("FACILITY_DISPLAY_NAME is required.");
  if (!faEmail || !faEmail.includes("@")) fail("FA_EMAIL is required.");
  assertSafePassword(faPassword);

  console.log(`bootstrap-pilot-admin: target ${databaseName}`);
  console.log(`bootstrap-pilot-admin: ${redactDatabaseUrl(url)}`);

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const existingFaRole = await prisma.role.findUnique({
      where: { key: RoleKey.FACILITY_ADMINISTRATOR },
      select: { id: true },
    });
    if (!existingFaRole) {
      fail('Role FACILITY_ADMINISTRATOR missing. Run prisma migrate deploy first.');
    }

    const existingFa = await prisma.user.findFirst({
      where: { role: { key: RoleKey.FACILITY_ADMINISTRATOR }, isActive: true },
      select: { id: true, email: true },
    });
    if (existingFa && !force) {
      fail(
        `An active Facility Administrator already exists (${existingFa.email}). ` +
          "Refuse re-bootstrap. Set BOOTSTRAP_FORCE=1 only with operator approval.",
      );
    }

    const emailTaken = await prisma.user.findUnique({
      where: { email: faEmail },
      select: { id: true },
    });
    if (emailTaken) {
      fail(`FA_EMAIL is already registered. Choose a different email.`);
    }

    const passwordHash = await bcrypt.hash(faPassword, 12);
    const now = new Date();

    const created = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: managementCompany ?? `${facilityName} Organization`,
          displayName: managementCompany ?? `${facilityName} Organization`,
          organizationType: managementCompany ? "MANAGEMENT_COMPANY" : "LONG_TERM_CARE",
          isActive: true,
        },
        select: { id: true },
      });

      const facility = await tx.facility.create({
        data: {
          displayName: facilityName,
          managementCompanyName: managementCompany,
          organizationId: organization.id,
          billingEmail: faEmail,
          timezone,
          onboardingStartedAt: now,
          onboardingCurrentStep: markOnboardingComplete ? "complete" : "facility",
          onboardingCompletedAt: markOnboardingComplete ? now : null,
        },
        select: { id: true, displayName: true, timezone: true },
      });

      const user = await tx.user.create({
        data: {
          facilityId: facility.id,
          roleId: existingFaRole.id,
          displayName: faDisplayName,
          email: faEmail,
          passwordHash,
          isActive: true,
        },
        select: { id: true, email: true },
      });

      await tx.userFacilityAccess.create({
        data: {
          userId: user.id,
          facilityId: facility.id,
          isActive: true,
          grantedAt: now,
        },
      });

      return { facility, user, organizationId: organization.id };
    });

    await upsertDefaultDepartments(prisma, created.facility.id);
    await applyLogTemplatePresets(prisma, {
      facilityId: created.facility.id,
      createdByRoleId: existingFaRole.id,
    });

    // Completion record — no secrets printed.
    console.log("bootstrap-pilot-admin: PASS");
    console.log(`  facilityId: ${created.facility.id}`);
    console.log(`  facility: ${created.facility.displayName}`);
    console.log(`  timezone: ${created.facility.timezone}`);
    console.log(`  organizationId: ${created.organizationId}`);
    console.log(`  facilityAdministratorUserId: ${created.user.id}`);
    console.log(`  facilityAdministratorEmail: ${created.user.email}`);
    console.log("  password: [redacted]");
    console.log("  quickPin: not created (password-required role)");
    console.log(
      markOnboardingComplete
        ? "  onboarding: marked complete"
        : "  onboarding: started — complete remaining Admin setup in UI",
    );
    console.log("Next: configure Dietary Department locations, Employees, devices, meal times;");
    console.log("      set OPERATIONAL_ASSIGNMENTS_ENABLED=true; keep OPERATION_ENGINE_ENABLED=false.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
