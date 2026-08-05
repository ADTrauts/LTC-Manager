#!/usr/bin/env node
/**
 * Synthetic fixtures for Phase 7A Assignment browser certification.
 * Disposable VERIFY_DATABASE_URL only. Never prints credentials.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_PATH =
  process.env.ASSIGNMENT_BROWSER_FIXTURE_PATH ||
  join(ROOT, "tmp", "assignment-browser-artifacts", "fixtures.json");

const SYNTHETIC_PASSWORD = process.env.SEED_DEMO_PASSWORD;
if (!SYNTHETIC_PASSWORD) {
  console.error("assignment-browser-fixtures: SEED_DEMO_PASSWORD is required");
  process.exit(1);
}

function serviceDateUtc(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
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
  dietaryId,
  roleType = "STAFF",
}) {
  const existing = await db.employee.findFirst({
    where: { facilityId, email },
    select: { id: true },
  });
  if (existing) {
    return db.employee.update({
      where: { id: existing.id },
      data: {
        firstName,
        lastName,
        status: "ACTIVE",
        primaryDepartmentId: dietaryId,
        roleType,
      },
      select: { id: true },
    });
  }
  return db.employee.create({
    data: {
      facilityId,
      email,
      firstName,
      lastName,
      status: "ACTIVE",
      primaryDepartmentId: dietaryId,
      roleType,
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
  console.log(`assignment-browser-fixtures: target ${target.databaseName}`);

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
    const servery = await db.unit.findFirstOrThrow({
      where: {
        facilityId: facility.id,
        name: "1A Naval Park",
        unitType: "SERVERY",
        isActive: true,
      },
      select: { id: true, name: true },
    });

    const supervisor = await upsertUser(db, {
      email: "assign.supervisor@ltc.local",
      displayName: "Assignment Supervisor",
      roleKey: "SUPERVISOR",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const staff = await upsertUser(db, {
      email: "assign.staff@ltc.local",
      displayName: "Assignment Staff",
      roleKey: "STAFF",
      facilityId: facility.id,
      primaryDepartmentId: dietary.id,
    });
    const fa = await upsertUser(db, {
      email: "assign.fa@ltc.local",
      displayName: "Assignment Facility Admin",
      roleKey: "FACILITY_ADMINISTRATOR",
      facilityId: facility.id,
      primaryDepartmentId: null,
    });

    // Password users resolve department/Assignment context via Employee email match.
    const supervisorEmployee = await ensureEmployee(db, {
      facilityId: facility.id,
      email: supervisor.email,
      firstName: "Assign",
      lastName: "SupervisorEmp",
      dietaryId: dietary.id,
      roleType: "SUPERVISOR",
    });
    await ensureDeptMembership(db, supervisorEmployee.id, dietary.id);

    const staffEmployee = await ensureEmployee(db, {
      facilityId: facility.id,
      email: staff.email,
      firstName: "Assign",
      lastName: "StaffEmp",
      dietaryId: dietary.id,
    });
    await ensureDeptMembership(db, staffEmployee.id, dietary.id);
    await db.employeeUnitAccess.upsert({
      where: {
        employeeId_unitId: { employeeId: staffEmployee.id, unitId: servery.id },
      },
      update: {},
      create: { employeeId: staffEmployee.id, unitId: servery.id },
    });
    await db.employee.update({
      where: { id: staffEmployee.id },
      data: { primaryUnitId: servery.id },
    });

    const scaleCount = 100;
    const scaleIds = [];
    for (let i = 0; i < scaleCount; i++) {
      const n = String(i + 1).padStart(3, "0");
      const emp = await ensureEmployee(db, {
        facilityId: facility.id,
        email: `assign.scale.${n}@ltc.local`,
        firstName: `Scale${n}`,
        lastName: "Dietary",
        dietaryId: dietary.id,
      });
      await ensureDeptMembership(db, emp.id, dietary.id);
      scaleIds.push(emp.id);
    }

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const serviceDateKey = `${y}-${m}-${d}`;
    const serviceDate = serviceDateUtc(serviceDateKey);

    const scheduledIds = [staffEmployee.id, ...scaleIds.slice(0, 39)];
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
            unitId: servery.id,
            plannedStart: "06:00",
            plannedEnd: "14:00",
          },
        });
      }
    }

    let template = await db.operationalAssignmentTemplate.findFirst({
      where: {
        facilityId: facility.id,
        departmentId: dietary.id,
        name: "Phase 7A Dietary Coverage",
      },
      select: { id: true },
    });
    if (!template) {
      template = await db.operationalAssignmentTemplate.create({
        data: {
          facilityId: facility.id,
          departmentId: dietary.id,
          name: "Phase 7A Dietary Coverage",
          description: "Pilot coverage requirement",
          isActive: true,
          items: {
            create: [
              {
                roleKey: "SERVER",
                roleLabel: "Server",
                requiredCount: 1,
                unitId: servery.id,
                sortOrder: 1,
              },
            ],
          },
        },
        select: { id: true },
      });
    }

    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    writeFileSync(
      FIXTURE_PATH,
      JSON.stringify(
        {
          facilityId: facility.id,
          facilityName: facility.displayName,
          departmentId: dietary.id,
          unitId: servery.id,
          unitName: servery.name,
          serviceDateKey,
          supervisorEmail: supervisor.email,
          staffEmail: staff.email,
          faEmail: fa.email,
          staffEmployeeId: staffEmployee.id,
          templateId: template.id,
          scaleEmployeeCount: scaleCount,
        },
        null,
        2,
      ),
    );
    console.log("assignment-browser-fixtures: wrote fixtures (no secrets)");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(`assignment-browser-fixtures: FAIL — ${err?.message || err}`);
  process.exit(1);
});
