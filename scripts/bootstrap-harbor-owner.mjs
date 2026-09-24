#!/usr/bin/env node
/**
 * Create or update the Harbor Console owner account.
 *
 * Usage (never commit secrets):
 *   HARBOR_OWNER_BOOTSTRAP_PASSWORD='…' npm run db:bootstrap-harbor-owner
 *
 * Optional:
 *   HARBOR_OWNER_EMAIL   (default andrew.trautman@vssyl.com)
 *   HARBOR_OWNER_DISPLAY_NAME
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const DEFAULT_EMAIL = "andrew.trautman@vssyl.com";
const UNSAFE_PASSWORDS = new Set([
  "changemenow123!",
  "password",
  "password123",
  "admin",
  "admin123",
  "ciseedpassword!changeme",
]);

function loadEnvFile(filename, { override = false } = {}) {
  try {
    const raw = readFileSync(resolve(process.cwd(), filename), "utf8");
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
      if (override || process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* missing file */
  }
}

function fail(message) {
  console.error(`bootstrap-harbor-owner: FAIL — ${message}`);
  process.exit(1);
}

loadEnvFile(".env");
loadEnvFile(".env.local", { override: true });

const email = (process.env.HARBOR_OWNER_EMAIL ?? DEFAULT_EMAIL).trim().toLowerCase();
const password = process.env.HARBOR_OWNER_BOOTSTRAP_PASSWORD ?? "";
const displayName = (process.env.HARBOR_OWNER_DISPLAY_NAME ?? "Andrew Trautman").trim();

if (!email.includes("@")) {
  fail("HARBOR_OWNER_EMAIL is not an email.");
}
if (!password || password.length < 12) {
  fail("HARBOR_OWNER_BOOTSTRAP_PASSWORD must be at least 12 characters.");
}
if (UNSAFE_PASSWORDS.has(password.toLowerCase())) {
  fail("Choose a stronger HARBOR_OWNER_BOOTSTRAP_PASSWORD.");
}

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

try {
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.platformStaff.findUnique({
    where: { email },
    select: { id: true, sessionVersion: true },
  });
  if (existing) {
    await prisma.platformStaff.update({
      where: { id: existing.id },
      data: {
        displayName,
        passwordHash,
        role: "OWNER",
        isActive: true,
        sessionVersion: existing.sessionVersion + 1,
      },
    });
    console.log(`bootstrap-harbor-owner: updated owner ${email}`);
  } else {
    await prisma.platformStaff.create({
      data: {
        email,
        displayName,
        passwordHash,
        role: "OWNER",
        isActive: true,
      },
    });
    console.log(`bootstrap-harbor-owner: created owner ${email}`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await prisma.$disconnect();
}
