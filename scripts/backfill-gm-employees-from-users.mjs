#!/usr/bin/env node
/**
 * One-time / optional: create Employee roster rows for GM Users that don't have a matching Employee
 * (same facility + same email). Safe to run multiple times.
 *
 * From ltc-manager/:
 *   node scripts/backfill-gm-employees-from-users.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EmployeeStatus,
  EmploymentType,
  PrismaClient,
  RoleKey,
} from "@prisma/client";

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
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // ignore missing .env
  }
}

function rosterNameFromSignupDisplayName(adminName) {
  const normalized = adminName.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { firstName: "General", lastName: "Manager" };
  }
  const spaceIdx = normalized.indexOf(" ");
  if (spaceIdx === -1) {
    const only = normalized.slice(0, 60);
    const firstName = only.length >= 2 ? only : `${only}GM`.slice(0, 60);
    return { firstName, lastName: "Manager" };
  }
  let firstName = normalized.slice(0, spaceIdx).trim().slice(0, 60);
  let lastName = normalized.slice(spaceIdx + 1).trim().slice(0, 60);
  if (firstName.length < 2) {
    firstName = `${firstName}`.padEnd(2, "-").slice(0, 60);
  }
  if (lastName.length < 2) {
    lastName = `${lastName}`.padEnd(2, "-").slice(0, 60);
  }
  return { firstName, lastName };
}

async function main() {
  loadEnvFile();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { key: RoleKey.GM, isActive: true } },
    select: { facilityId: true, email: true, displayName: true },
  });

  let created = 0;
  for (const u of users) {
    const email = u.email.toLowerCase();
    const existing = await prisma.employee.findFirst({
      where: {
        facilityId: u.facilityId,
        email: { equals: email, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (existing) continue;

    const { firstName, lastName } = rosterNameFromSignupDisplayName(u.displayName);
    await prisma.employee.create({
      data: {
        facilityId: u.facilityId,
        firstName,
        lastName,
        email,
        roleType: RoleKey.GM,
        status: EmployeeStatus.ACTIVE,
        employmentType: EmploymentType.FULL_TIME,
      },
    });
    created += 1;
  }

  console.log(`Backfill complete. Created ${created} employee row(s) for GM user(s) missing a roster match.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
