#!/usr/bin/env node
/**
 * Blank install: one Facility, one GM User (email/password), one GM Employee (PIN for floor testing).
 *
 * Requires DATABASE_URL + AUTH_SECRET (load from .env in project root).
 * Pass secrets only via environment variables — do not commit them.
 *
 * Usage (from ltc-manager/):
 *   FACILITY_DISPLAY_NAME="Terrace View" \
 *   GM_EMAIL="you@company.com" \
 *   GM_PASSWORD='your-password' \
 *   GM_PIN="123456" \
 *   GM_DISPLAY_NAME="Your Name" \
 *   node scripts/provision-facility.mjs
 *
 * Optional: FACILITY_MANAGEMENT_COMPANY, GM_FIRST_NAME, GM_LAST_NAME
 */

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import {
  EmployeeStatus,
  EmploymentType,
  PrismaClient,
  RoleKey,
} from "@prisma/client";

import { applyLogTemplatePresets } from "../prisma/apply-log-template-presets.mjs";

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

function pinDigestForFacility(facilityId, pin) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required (same as app; used for PIN digest).");
  }
  return createHmac("sha256", secret)
    .update(`${facilityId}:${pin.trim()}`)
    .digest("hex");
}

loadEnvFile();

const prisma = new PrismaClient();

async function main() {
  const displayName = process.env.FACILITY_DISPLAY_NAME ?? "Terrace View";
  const managementCompany = process.env.FACILITY_MANAGEMENT_COMPANY || null;
  const gmEmail = (process.env.GM_EMAIL ?? "").trim().toLowerCase();
  const gmPassword = process.env.GM_PASSWORD ?? "";
  const gmDisplayName = process.env.GM_DISPLAY_NAME ?? "Andrew Trautman";
  const gmPin = (process.env.GM_PIN ?? "").trim();
  const firstName = process.env.GM_FIRST_NAME ?? "Andrew";
  const lastName = process.env.GM_LAST_NAME ?? "Trautman";

  if (!gmEmail || !gmPassword) {
    console.error("Set GM_EMAIL and GM_PASSWORD in the environment.");
    process.exit(1);
  }
  if (!/^\d{6}$/.test(gmPin)) {
    console.error("GM_PIN must be exactly 6 digits.");
    process.exit(1);
  }

  if (process.env.PROVISION_ALLOW_NONEMPTY !== "1") {
    const existingUser = await prisma.user.findFirst();
    if (existingUser) {
      console.error(
        "Abort: database already has users. Use an empty database, or set PROVISION_ALLOW_NONEMPTY=1 (dangerous).",
      );
      process.exit(1);
    }
  }

  const gmRole = await prisma.role.findUnique({ where: { key: RoleKey.GM } });
  if (!gmRole) {
    console.error('Abort: Role "GM" not found. Run: npx prisma migrate deploy');
    process.exit(1);
  }

  const facility = await prisma.facility.create({
    data: {
      displayName,
      managementCompanyName: managementCompany,
    },
  });

  await applyLogTemplatePresets(prisma, {
    facilityId: facility.id,
    createdByRoleId: gmRole.id,
  });

  const passwordHash = await bcrypt.hash(gmPassword, 12);

  await prisma.user.create({
    data: {
      email: gmEmail,
      displayName: gmDisplayName,
      passwordHash,
      facilityId: facility.id,
      roleId: gmRole.id,
      isActive: true,
    },
  });

  const digest = pinDigestForFacility(facility.id, gmPin);

  await prisma.employee.create({
    data: {
      facilityId: facility.id,
      firstName,
      lastName,
      email: gmEmail,
      roleType: RoleKey.GM,
      status: EmployeeStatus.ACTIVE,
      employmentType: EmploymentType.FULL_TIME,
      pinDigest: digest,
    },
  });

  console.log("");
  console.log("Provisioned blank facility.");
  console.log("  Facility:", displayName, `id=${facility.id}`);
  console.log("  Email sign-in:", gmEmail);
  console.log("  Same person has Employee PIN for floor testing after device bind.");
  console.log("");
  console.log("Next: npm run dev → sign in → /settings → Bind device → sign out → PIN pad.");
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
