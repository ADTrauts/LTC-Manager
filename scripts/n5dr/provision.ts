/**
 * Isolated N5D-R fixture on the disposable database.
 * Writes gitignored .env.n5dr. Does not print secrets or connection strings.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chmod } from "node:fs/promises";

import { PrismaClient, RoleKey } from "@prisma/client";
import bcrypt from "bcryptjs";
import webpush from "web-push";

import { facilityLocalDateToServiceDate, getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

const zone = "America/New_York";

function loadEnvFile(path: string, into: Record<string, string>) {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    into[trimmed.slice(0, eq)] = value;
  }
}

function disposableUrl(raw: string): string {
  const parsed = new URL(raw);
  parsed.pathname = "/ltc_verify_n1a";
  const host = parsed.hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("N5D-R refuses a non-loopback database host.");
  }
  const url = parsed.toString();
  assertDisposableDatabaseUrl(url);
  return url;
}

const env: Record<string, string> = {};
loadEnvFile(".env", env);
loadEnvFile(".env.local", env);
if (!env.DATABASE_URL) throw new Error("DATABASE_URL missing");
const databaseUrl = disposableUrl(env.DATABASE_URL);
const directUrl = env.DIRECT_URL ? disposableUrl(env.DIRECT_URL) : databaseUrl;
const parsed = new URL(databaseUrl);
console.log("database", parsed.hostname, parsed.pathname);

const keys = (webpush as unknown as { generateVAPIDKeys: () => { publicKey: string; privateKey: string } }).generateVAPIDKeys();
if (!keys.publicKey || !keys.privateKey) throw new Error("VAPID generation failed");
console.log("vapid public length", keys.publicKey.length, "private length", keys.privateKey.length);

async function main() {
const suffix = randomBytes(4).toString("hex");
const email = `n5dr-${suffix}@example.test`;
const password = `N5dr-${randomBytes(18).toString("base64url")}`;
const passwordHash = await bcrypt.hash(password, 12);
const now = new Date();
const serviceDateKey = toServiceDateKey(getFacilityServiceDate(zone, now));
const serviceDate = facilityLocalDateToServiceDate(serviceDateKey);

const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const previous = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "false";
try {
  for (const key of Object.values(RoleKey)) {
    await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
  }
  const managerRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.MANAGER } });
  const org = await db.organization.create({ data: { name: `N5DR ${suffix}` } });
  const facility = await db.facility.create({
    data: { organizationId: org.id, displayName: `N5DR Terrace ${suffix}`, timezone: zone },
  });
  const dietary = await db.department.create({
    data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition", isActive: true },
  });
  const kitchen = await db.unit.create({
    data: { facilityId: facility.id, name: `N5DR Kitchen ${suffix}`, unitType: "KITCHEN" },
  });
  const user = await db.user.create({
    data: {
      email,
      displayName: "N5DR Tester",
      facilityId: facility.id,
      roleId: managerRole.id,
      primaryDepartmentId: dietary.id,
      passwordHash,
      emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const access = await db.userFacilityAccess.create({
    data: { userId: user.id, facilityId: facility.id, isActive: true },
  });
  await db.userFacilityRolePeriod.create({
    data: {
      userFacilityAccessId: access.id,
      roleKey: RoleKey.MANAGER,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const employee = await db.employee.create({
    data: {
      facilityId: facility.id,
      userId: user.id,
      firstName: "N5DR",
      lastName: "Tester",
      roleType: RoleKey.MANAGER,
      primaryDepartmentId: dietary.id,
    },
  });
  await db.operationalAssignment.create({
    data: {
      facilityId: facility.id,
      departmentId: dietary.id,
      employeeId: employee.id,
      serviceDate,
      roleKey: "DIETARY_ON_CALL_COVERAGE",
      roleLabel: "On-Call Coverage",
      status: "PLANNED",
      startsAt: new Date(now.getTime() - 60 * 60 * 1000),
      endsAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
    },
  });
  const asset = await db.asset.create({
    data: {
      assetCode: `N5DR-${suffix}`,
      name: "Test cooler",
      equipmentType: "EQUIPMENT",
      unitId: kitchen.id,
      departmentId: dietary.id,
      criticality: "ROUTINE",
      status: "OPERATIONAL",
    },
  });

  const lines = [
    `DATABASE_URL=${databaseUrl}`,
    `DIRECT_URL=${directUrl}`,
    `VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `VAPID_PRIVATE_KEY=${keys.privateKey}`,
    `VAPID_SUBJECT=mailto:n5dr-test@example.test`,
    `WEB_PUSH_SENDING_ENABLED=true`,
    `CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED=false`,
    `N5DR_EMAIL=${email}`,
    `N5DR_PASSWORD=${password}`,
    `N5DR_USER_ID=${user.id}`,
    `N5DR_FACILITY_ID=${facility.id}`,
    `N5DR_DEPARTMENT_ID=${dietary.id}`,
    `N5DR_ASSET_ID=${asset.id}`,
    `N5DR_ORG_ID=${org.id}`,
    `N5DR_EMPLOYEE_ID=${employee.id}`,
  ];
  writeFileSync(".env.n5dr", `${lines.join("\n")}\n`, { mode: 0o600 });
  await chmod(".env.n5dr", 0o600);
  console.log("fixture ready", suffix, "user", user.id, "facility", facility.id, "asset", asset.id);
} finally {
  if (previous === undefined) delete process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  else process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = previous;
  await db.$disconnect();
}
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "provision failed");
  process.exit(1);
});
