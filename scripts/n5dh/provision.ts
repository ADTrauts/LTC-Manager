/**
 * Certification fixture for the isolated vssyl-cert database only.
 * Refuses any other host. Does not print secrets or connection strings.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chmod } from "node:fs/promises";

import { PrismaClient, RoleKey } from "@prisma/client";
import bcrypt from "bcryptjs";

import { facilityLocalDateToServiceDate, getFacilityServiceDate, toServiceDateKey } from "@/lib/operational-time";

const zone = "America/New_York";
const expectedHost = "ep-cold-frog-bc28042e.c-16.us-east-1.aws.neon.tech";

function load(path: string) {
  const into: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    into[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return into;
}

const file = load(".env.vssyl-cert");
const databaseUrl = file.DIRECT_URL || file.DATABASE_URL;
const parsed = new URL(databaseUrl);
if (parsed.hostname !== expectedHost || parsed.pathname !== "/vssyl_cert") {
  throw new Error("refusing fixture outside the certification database");
}

async function main() {
  const suffix = randomBytes(3).toString("hex");
  const passwordA = `CertA-${randomBytes(18).toString("base64url")}`;
  const passwordB = `CertB-${randomBytes(18).toString("base64url")}`;
  const emailA = `cert-a-${suffix}@example.test`;
  const emailB = `cert-b-${suffix}@example.test`;
  const [hashA, hashB] = await Promise.all([bcrypt.hash(passwordA, 12), bcrypt.hash(passwordB, 12)]);
  const now = new Date();
  const serviceDate = facilityLocalDateToServiceDate(toServiceDateKey(getFacilityServiceDate(zone, now)));
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const previous = process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED;
  process.env.CONTRACTED_DEPARTMENT_AUTHORITY_ENABLED = "false";
  try {
    const identity = await db.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
    if (identity[0]?.db !== "vssyl_cert") throw new Error("connected database is not vssyl_cert");
    for (const key of Object.values(RoleKey)) {
      await db.role.upsert({ where: { key }, create: { key, name: key }, update: { isActive: true } });
    }
    const managerRole = await db.role.findUniqueOrThrow({ where: { key: RoleKey.MANAGER } });
    const org = await db.organization.create({ data: { name: `Cert ${suffix}` } });
    const facility = await db.facility.create({
      data: { organizationId: org.id, displayName: `Cert Terrace ${suffix}`, timezone: zone },
    });
    const dietary = await db.department.create({
      data: { facilityId: facility.id, key: "DIETARY", name: "Food and Nutrition", isActive: true },
    });
    const kitchen = await db.unit.create({
      data: { facilityId: facility.id, name: `Cert Kitchen ${suffix}`, unitType: "KITCHEN" },
    });
    async function makeUser(email: string, hash: string, displayName: string, first: string) {
      const user = await db.user.create({
        data: {
          email,
          displayName,
          facilityId: facility.id,
          roleId: managerRole.id,
          primaryDepartmentId: dietary.id,
          passwordHash: hash,
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
          firstName: first,
          lastName: "Cert",
          roleType: RoleKey.MANAGER,
          primaryDepartmentId: dietary.id,
        },
      });
      return { user, employee };
    }
    const a = await makeUser(emailA, hashA, "Cert User A", "CertA");
    const b = await makeUser(emailB, hashB, "Cert User B", "CertB");
    await db.operationalAssignment.create({
      data: {
        facilityId: facility.id,
        departmentId: dietary.id,
        employeeId: a.employee.id,
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
        assetCode: `CERT-${suffix}`,
        name: "Test cooler",
        equipmentType: "EQUIPMENT",
        unitId: kitchen.id,
        departmentId: dietary.id,
        criticality: "ROUTINE",
        status: "OPERATIONAL",
      },
    });
    const repair = await db.repair.create({
      data: {
        repairCode: `CERT-WO-${suffix}`,
        assetId: asset.id,
        unitId: kitchen.id,
        title: "Test work order",
        description: "Certification fixture only.",
        requestingDepartmentId: dietary.id,
        responsibleDepartmentId: dietary.id,
        assignedEmployeeId: b.employee.id,
        reportedById: a.user.id,
      },
    });
    const extra = [
      `CERT_EMAIL_A=${emailA}`,
      `CERT_PASSWORD_A=${passwordA}`,
      `CERT_EMAIL_B=${emailB}`,
      `CERT_PASSWORD_B=${passwordB}`,
      `CERT_USER_A=${a.user.id}`,
      `CERT_USER_B=${b.user.id}`,
      `CERT_FACILITY_ID=${facility.id}`,
      `CERT_ORG_ID=${org.id}`,
      `CERT_ASSET_ID=${asset.id}`,
      `CERT_REPAIR_ID=${repair.id}`,
      `CERT_EMPLOYEE_A=${a.employee.id}`,
      `CERT_EMPLOYEE_B=${b.employee.id}`,
    ];
    const next = `${readFileSync(".env.vssyl-cert", "utf8").trim()}\n${extra.join("\n")}\n`;
    writeFileSync(".env.vssyl-cert", next, { mode: 0o600 });
    await chmod(".env.vssyl-cert", 0o600);
    console.log(
      JSON.stringify({
        database: identity[0]?.db,
        suffix,
        userA: a.user.id,
        userB: b.user.id,
        facility: facility.id,
        asset: asset.id,
        repair: repair.id,
      }),
    );
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
