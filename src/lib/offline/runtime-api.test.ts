/**
 * SQL-backed tests for Phase 6A offline Runtime APIs.
 *
 * Uses OFFLINE_RUNTIME_TEST_DATABASE_URL, or VERIFY_DATABASE_URL when the verify runner
 * supplies a shared disposable database (same pattern as other SQL-backed suites).
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { randomUUID, createHmac } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

const TEST_DATABASE_URL =
  process.env.OFFLINE_RUNTIME_TEST_DATABASE_URL ?? process.env.VERIFY_DATABASE_URL;
const skip = TEST_DATABASE_URL
  ? false
  : "set OFFLINE_RUNTIME_TEST_DATABASE_URL or VERIFY_DATABASE_URL to a disposable migrated database to run these";

process.env.AUTH_SECRET ??= "offline-runtime-db-test-secret";

type Fixture = {
  db: PrismaClient;
  buildRuntimeBundle: typeof import("./build-runtime-bundle").buildRuntimeBundle;
  processSyncCommand: typeof import("./process-sync-command").processSyncCommand;
  facilityId: string;
  unitId: string;
  dietaryDepartmentId: string;
  employeeId: string;
};

let fixture: Fixture | null = null;

async function getFixture(): Promise<Fixture | null> {
  if (fixture) return fixture;
  const { PrismaClient: Client } = await import("@prisma/client");
  const db = new Client({ datasources: { db: { url: TEST_DATABASE_URL } } });

  // Dedicated scope so shared seed Cycles do not choose the timing model.
  // Ready is a Key Point. Replaying the same command stays accepted; a second
  // command for that moment is a conflict.
  const tag = randomUUID();
  const organization = await db.organization.create({ data: { name: `Offline SQL ${tag}` } });
  const facility = await db.facility.create({ data: { organizationId: organization.id, displayName: `Offline SQL ${tag}`, timezone: "America/New_York" } });
  const dietary = await db.department.create({ data: { facilityId: facility.id, key: "DIETARY", name: "Dietary" } });
  const unit = await db.unit.create({ data: { facilityId: facility.id, name: "Offline test servery", unitType: "SERVERY", hierarchyRole: "NEIGHBORHOOD", departmentResponsibilities: { create: { departmentId: dietary.id, kind: "PRIMARY" } } } });
  await db.departmentOperationalCycle.create({ data: { facilityId: facility.id, departmentId: dietary.id, stableKey: "breakfast", version: 1, label: "Offline breakfast", cycleType: "SERVICE", mealType: "BREAKFAST", status: "PUBLISHED", startLocal: "00:00", endLocal: "23:59", expectedMilestones: [], applicableDaysOfWeek: [0,1,2,3,4,5,6], effectiveFrom: new Date("2020-01-01"), locationMode: "EXPLICIT_UNITS", locations: { create: { unitId: unit.id } } } });
  await db.departmentOperationalCycle.create({ data: { facilityId: facility.id, departmentId: dietary.id, stableKey: "breakfast_ready", parentStableKey: "breakfast", nodeKind: "KEY_TIME", occurrenceTracking: "REQUIRED", keyPointGrain: "DEPARTMENT", version: 1, label: "Breakfast ready", cycleType: "SERVICE", mealType: "BREAKFAST", status: "PUBLISHED", applicableDaysOfWeek: [0,1,2,3,4,5,6], effectiveFrom: new Date("2020-01-01"), locationMode: "ALL_DEPARTMENT_UNITS" } });
  const employee = await db.employee.create({ data: { facilityId: facility.id, firstName: "Offline", lastName: "Tester", email: `offline-${tag}@example.test`, roleType: "STAFF", status: "ACTIVE", primaryDepartmentId: dietary.id, pinDigest: createHmac("sha256", process.env.AUTH_SECRET!).update(`${facility.id}:246813`).digest("hex"), employeeDepartments: { create: { departmentId: dietary.id, roleType: "STAFF" } }, unitAccesses: { create: { unitId: unit.id } } } });

  fixture = {
    db,
    buildRuntimeBundle: (await import("./build-runtime-bundle")).buildRuntimeBundle,
    processSyncCommand: (await import("./process-sync-command")).processSyncCommand,
    facilityId: facility.id,
    unitId: unit.id,
    dietaryDepartmentId: dietary.id,
    employeeId: employee.id,
  };
  return fixture;
}

after(async () => {
  await fixture?.db.$disconnect();
});

test("buildRuntimeBundle requires Dietary operational authority", { skip }, async () => {
  const fx = await getFixture();
  assert.ok(fx);

  const session = {
    uid: "admin-user",
    authKind: "user" as const,
    authMethod: "PASSWORD" as const,
    scopeKind: "facility" as const,
    role: "FACILITY_ADMINISTRATOR" as const,
    name: "Admin",
    email: "admin@test.local",
    facilityId: fx.facilityId,
    sessionVersion: 0,
  };

  const result = await fx.buildRuntimeBundle(
    {
      session,
      unitId: fx.unitId,
      deviceFacilityId: fx.facilityId,
      deviceBoundUnitId: fx.unitId,
    },
    fx.db,
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 403);
});

test("processSyncCommand accepts idempotent offline ready command", { skip }, async () => {
  const fx = await getFixture();
  assert.ok(fx);

  const session = {
    uid: fx.employeeId,
    authKind: "employee" as const,
    authMethod: "QUICK_PIN" as const,
    scopeKind: "facility" as const,
    role: "STAFF" as const,
    name: "Staff",
    email: "",
    facilityId: fx.facilityId,
    sessionVersion: 0,
  };

  const meal = { mealType: "BREAKFAST" as const };
  assert.ok(meal);

  const clientCommandId = `offline-test-${Date.now()}`;
  const command = {
    clientCommandId,
    commandType: "RECORD_SERVERY_READY" as const,
    facilityId: fx.facilityId,
    departmentId: fx.dietaryDepartmentId,
    unitId: fx.unitId,
    operationalDate: "2026-08-05",
    mealType: meal.mealType,
    occurredAt: new Date().toISOString(),
    locallyRecordedAt: new Date().toISOString(),
    deviceBoundUnitId: fx.unitId,
    actorRef: `employee:${fx.employeeId}`,
    authMethod: "QUICK_PIN" as const,
    scopeKind: "facility" as const,
    role: "STAFF",
    bundleVersion: "test",
    expectedServerRevision: "test",
    deviceTimezoneOffsetMinutes: 240,
  };

  const first = await fx.processSyncCommand(
    { session, command, deviceFacilityId: fx.facilityId, deviceBoundUnitId: fx.unitId },
    fx.db,
  );
  assert.equal(first.category, "ACCEPTED", JSON.stringify(first));

  const second = await fx.processSyncCommand(
    { session, command, deviceFacilityId: fx.facilityId, deviceBoundUnitId: fx.unitId },
    fx.db,
  );
  assert.equal(second.category, "ALREADY_ACCEPTED");
});

test("duplicate different command creates conflict review", { skip }, async () => {
  const fx = await getFixture();
  assert.ok(fx);

  const session = {
    uid: fx.employeeId,
    authKind: "employee" as const,
    authMethod: "QUICK_PIN" as const,
    scopeKind: "facility" as const,
    role: "STAFF" as const,
    name: "Staff",
    email: "",
    facilityId: fx.facilityId,
    sessionVersion: 0,
  };

  const meal = { mealType: "BREAKFAST" as const };
  assert.ok(meal);

  const base = {
    commandType: "RECORD_SERVERY_READY" as const,
    facilityId: fx.facilityId,
    departmentId: fx.dietaryDepartmentId,
    unitId: fx.unitId,
    operationalDate: "2026-08-05",
    mealType: meal.mealType,
    occurredAt: new Date().toISOString(),
    locallyRecordedAt: new Date().toISOString(),
    deviceBoundUnitId: fx.unitId,
    actorRef: `employee:${fx.employeeId}`,
    authMethod: "QUICK_PIN" as const,
    scopeKind: "facility" as const,
    role: "STAFF",
    bundleVersion: "test",
    expectedServerRevision: "test",
    deviceTimezoneOffsetMinutes: 240,
  };

  await fx.processSyncCommand(
    {
      session,
      command: { ...base, clientCommandId: `first-${Date.now()}` },
      deviceFacilityId: fx.facilityId,
      deviceBoundUnitId: fx.unitId,
    },
    fx.db,
  );

  const conflict = await fx.processSyncCommand(
    {
      session,
      command: { ...base, clientCommandId: `second-${Date.now()}` },
      deviceFacilityId: fx.facilityId,
      deviceBoundUnitId: fx.unitId,
    },
    fx.db,
  );

  assert.equal(conflict.category, "CONFLICT_REVIEW_REQUIRED", JSON.stringify(conflict));
});
