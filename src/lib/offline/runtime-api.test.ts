/**
 * SQL-backed tests for Phase 6A offline Runtime APIs.
 *
 * Uses OFFLINE_RUNTIME_TEST_DATABASE_URL, or VERIFY_DATABASE_URL when the verify runner
 * supplies a shared disposable database (same pattern as other SQL-backed suites).
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";

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

  const unit = await db.unit.findFirst({
    where: {
      unitType: "SERVERY",
      isActive: true,
      mealTimes: { some: { isActive: true } },
      facility: { departments: { some: { key: "DIETARY", isActive: true } } },
    },
    select: {
      id: true,
      facilityId: true,
      facility: { select: { displayName: true } },
    },
  });
  if (!unit) return null;

  const dietary = await db.department.findFirstOrThrow({
    where: { facilityId: unit.facilityId, key: "DIETARY", isActive: true },
    select: { id: true },
  });

  const employee = await db.employee.findFirst({
    where: {
      facilityId: unit.facilityId,
      status: { not: "TERMINATED" },
      OR: [
        { primaryDepartmentId: dietary.id },
        { employeeDepartments: { some: { departmentId: dietary.id } } },
      ],
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!employee) return null;

  fixture = {
    db,
    buildRuntimeBundle: (await import("./build-runtime-bundle")).buildRuntimeBundle,
    processSyncCommand: (await import("./process-sync-command")).processSyncCommand,
    facilityId: unit.facilityId,
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
    role: "STAFF" as const,
    name: "Staff",
    email: "",
    facilityId: fx.facilityId,
    sessionVersion: 0,
  };

  const meal = await fx.db.unitMealTime.findFirst({
    where: { unitId: fx.unitId, isActive: true },
    select: { mealType: true },
  });
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
    role: "STAFF",
    bundleVersion: "test",
    expectedServerRevision: "test",
    deviceTimezoneOffsetMinutes: 240,
  };

  const first = await fx.processSyncCommand(
    { session, command, deviceFacilityId: fx.facilityId, deviceBoundUnitId: fx.unitId },
    fx.db,
  );
  assert.equal(first.category, "ACCEPTED");

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
    role: "STAFF" as const,
    name: "Staff",
    email: "",
    facilityId: fx.facilityId,
    sessionVersion: 0,
  };

  const meal = await fx.db.unitMealTime.findFirst({
    where: { unitId: fx.unitId, isActive: true },
    select: { mealType: true },
  });
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

  assert.equal(conflict.category, "CONFLICT_REVIEW_REQUIRED");
});
