/**
 * Exercises the real SQL behind assignment and repair reference scoping, so it needs a throwaway
 * Postgres database that has had `prisma migrate deploy` and the seed applied.
 *
 * Set OBJECT_SCOPE_TEST_DATABASE_URL to point at one. Without it the suite skips, which keeps
 * `npm test` hermetic on a fresh clone. Never point this at a database holding real data: the
 * suite creates and deletes facilities, units, departments, operations, and vendors.
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";

import type { PrismaClient } from "@prisma/client";

const TEST_DATABASE_URL = process.env.OBJECT_SCOPE_TEST_DATABASE_URL;
const skip = TEST_DATABASE_URL
  ? false
  : "set OBJECT_SCOPE_TEST_DATABASE_URL to a disposable migrated database to run these";

process.env.AUTH_SECRET ??= "object-scope-db-test-secret";

const SERVICE_DATE_KEY = "2031-03-04";
const OTHER_SERVICE_DATE_KEY = "2031-03-05";

function serviceDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

type Side = {
  facilityId: string;
  departmentId: string;
  secondDepartmentId: string;
  unitId: string;
  operationInstanceId: string;
  /** Same facility and date, but owned by `secondDepartmentId`. */
  otherDepartmentOperationInstanceId: string;
  /** Same facility and department, but a different service date. */
  otherDateOperationInstanceId: string;
  vendorId: string;
};

type Fixture = {
  db: PrismaClient;
  lib: typeof import("./assignment-references");
  a: Side;
  b: Side;
};

let fixture: Fixture | null = null;
const createdFacilityIds: string[] = [];

let counter = 0;
function unique(prefix: string) {
  counter += 1;
  return `${prefix}-${process.pid}-${Date.now()}-${counter}`;
}

async function buildSide(db: PrismaClient, organizationId: string, label: string): Promise<Side> {
  const facility = await db.facility.create({
    data: { displayName: `Scope ${label}`, organizationId, timezone: "America/New_York" },
    select: { id: true },
  });
  createdFacilityIds.push(facility.id);

  const department = await db.department.create({
    data: { facilityId: facility.id, key: "DIETARY", name: `Dietary ${label}` },
    select: { id: true },
  });
  const secondDepartment = await db.department.create({
    data: { facilityId: facility.id, key: "EVS", name: `EVS ${label}` },
    select: { id: true },
  });

  const unit = await db.unit.create({
    data: {
      facilityId: facility.id,
      name: `Unit ${label}`,
      unitType: "SERVERY",
      isActive: true,
    },
    select: { id: true },
  });
  // Declare the unit as Dietary's, so the cross-department coherence check has something to read.
  await db.unitDepartmentResponsibility.create({
    data: { unitId: unit.id, departmentId: department.id, kind: "PRIMARY" },
  });

  const definition = await db.operationDefinition.create({
    data: {
      facilityId: facility.id,
      departmentId: department.id,
      key: unique("op"),
      label: `Breakfast ${label}`,
    },
    select: { id: true },
  });
  const secondDefinition = await db.operationDefinition.create({
    data: {
      facilityId: facility.id,
      departmentId: secondDepartment.id,
      key: unique("op"),
      label: `Round ${label}`,
    },
    select: { id: true },
  });

  const instance = await db.operationInstance.create({
    data: {
      facilityId: facility.id,
      departmentId: department.id,
      definitionId: definition.id,
      serviceDate: serviceDate(SERVICE_DATE_KEY),
      label: `Breakfast ${label}`,
    },
    select: { id: true },
  });
  const otherDepartmentInstance = await db.operationInstance.create({
    data: {
      facilityId: facility.id,
      departmentId: secondDepartment.id,
      definitionId: secondDefinition.id,
      serviceDate: serviceDate(SERVICE_DATE_KEY),
      label: `Round ${label}`,
    },
    select: { id: true },
  });
  const otherDateInstance = await db.operationInstance.create({
    data: {
      facilityId: facility.id,
      departmentId: department.id,
      definitionId: definition.id,
      serviceDate: serviceDate(OTHER_SERVICE_DATE_KEY),
      label: `Breakfast ${label} next day`,
    },
    select: { id: true },
  });

  const vendor = await db.vendor.create({
    data: { facilityId: facility.id, name: `Vendor ${label}` },
    select: { id: true },
  });

  return {
    facilityId: facility.id,
    departmentId: department.id,
    secondDepartmentId: secondDepartment.id,
    unitId: unit.id,
    operationInstanceId: instance.id,
    otherDepartmentOperationInstanceId: otherDepartmentInstance.id,
    otherDateOperationInstanceId: otherDateInstance.id,
    vendorId: vendor.id,
  };
}

async function getFixture(): Promise<Fixture | null> {
  if (fixture) return fixture;
  const { PrismaClient: Client } = await import("@prisma/client");
  const db = new Client({ datasources: { db: { url: TEST_DATABASE_URL } } });

  const organization = await db.organization.findFirst({ select: { id: true } });
  if (!organization) return null;

  fixture = {
    db,
    lib: await import("./assignment-references"),
    a: await buildSide(db, organization.id, unique("A")),
    b: await buildSide(db, organization.id, unique("B")),
  };
  return fixture;
}

after(async () => {
  if (!fixture) return;
  const { db } = fixture;
  for (const facilityId of createdFacilityIds) {
    await db.operationalAssignment.deleteMany({ where: { facilityId } });
    await db.operationInstance.deleteMany({ where: { facilityId } });
    await db.operationDefinition.deleteMany({ where: { facilityId } });
    await db.vendor.deleteMany({ where: { facilityId } });
    await db.unitDepartmentResponsibility.deleteMany({ where: { unit: { facilityId } } });
    await db.unit.deleteMany({ where: { facilityId } });
    await db.department.deleteMany({ where: { facilityId } });
    await db.facility.deleteMany({ where: { id: facilityId } });
  }
  await db.$disconnect();
});

test("a fully in-scope combination is accepted", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;

  const result = await f.lib.resolveAssignmentReferences(f.db, {
    facilityId: f.a.facilityId,
    departmentId: f.a.departmentId,
    serviceDateKey: SERVICE_DATE_KEY,
    unitId: f.a.unitId,
    operationInstanceId: f.a.operationInstanceId,
  });
  assert.equal(result.ok, true);
});

test("omitting both optional references is accepted", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;

  const result = await f.lib.resolveAssignmentReferences(f.db, {
    facilityId: f.a.facilityId,
    departmentId: f.a.departmentId,
    serviceDateKey: SERVICE_DATE_KEY,
    unitId: null,
    operationInstanceId: null,
  });
  assert.equal(result.ok, true);
});

test("another facility's OperationInstance is rejected", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;

  const result = await f.lib.resolveAssignmentReferences(f.db, {
    facilityId: f.a.facilityId,
    departmentId: f.a.departmentId,
    serviceDateKey: SERVICE_DATE_KEY,
    unitId: null,
    operationInstanceId: f.b.operationInstanceId,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "OPERATION_NOT_FOUND");
});

test("another department's OperationInstance is rejected within the same facility", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;

  const result = await f.lib.resolveAssignmentReferences(f.db, {
    facilityId: f.a.facilityId,
    departmentId: f.a.departmentId,
    serviceDateKey: SERVICE_DATE_KEY,
    unitId: null,
    operationInstanceId: f.a.otherDepartmentOperationInstanceId,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "OPERATION_DEPARTMENT_MISMATCH");
});

test("an OperationInstance for a different service date is rejected", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;

  const result = await f.lib.resolveAssignmentReferences(f.db, {
    facilityId: f.a.facilityId,
    departmentId: f.a.departmentId,
    serviceDateKey: SERVICE_DATE_KEY,
    unitId: null,
    operationInstanceId: f.a.otherDateOperationInstanceId,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "OPERATION_DATE_MISMATCH");
});

test("another facility's Unit is rejected", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;

  const result = await f.lib.resolveAssignmentReferences(f.db, {
    facilityId: f.a.facilityId,
    departmentId: f.a.departmentId,
    serviceDateKey: SERVICE_DATE_KEY,
    unitId: f.b.unitId,
    operationInstanceId: f.a.operationInstanceId,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "UNIT_NOT_FOUND");
});

test("a Unit and OperationInstance from different departments are rejected as incoherent", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;

  // The unit is declared Dietary's; the operation belongs to EVS. Both are in the facility, so
  // only the mutual-consistency check catches this.
  const result = await f.lib.resolveAssignmentReferences(f.db, {
    facilityId: f.a.facilityId,
    departmentId: f.a.secondDepartmentId,
    serviceDateKey: SERVICE_DATE_KEY,
    unitId: f.a.unitId,
    operationInstanceId: f.a.otherDepartmentOperationInstanceId,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "UNIT_OPERATION_MISMATCH");
});

test("a unit that declares no department responsibilities is not treated as excluded", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;

  const legacyUnit = await f.db.unit.create({
    data: {
      facilityId: f.a.facilityId,
      name: unique("legacy-unit"),
      unitType: "SERVERY",
      isActive: true,
    },
    select: { id: true },
  });

  // A missing declaration is absence of evidence, not evidence of exclusion, so this must not
  // invent ownership the schema never recorded.
  const result = await f.lib.resolveAssignmentReferences(f.db, {
    facilityId: f.a.facilityId,
    departmentId: f.a.departmentId,
    serviceDateKey: SERVICE_DATE_KEY,
    unitId: legacyUnit.id,
    operationInstanceId: f.a.operationInstanceId,
  });
  assert.equal(result.ok, true);
});

test("a nonexistent OperationInstance is rejected the same way as a forbidden one", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;

  const missing = await f.lib.resolveAssignmentReferences(f.db, {
    facilityId: f.a.facilityId,
    departmentId: f.a.departmentId,
    serviceDateKey: SERVICE_DATE_KEY,
    unitId: null,
    operationInstanceId: "does-not-exist-anywhere",
  });
  const forbidden = await f.lib.resolveAssignmentReferences(f.db, {
    facilityId: f.a.facilityId,
    departmentId: f.a.departmentId,
    serviceDateKey: SERVICE_DATE_KEY,
    unitId: null,
    operationInstanceId: f.b.operationInstanceId,
  });

  assert.equal(missing.ok, false);
  assert.equal(forbidden.ok, false);
  // Identical outcome and identical message: the caller cannot tell an id that does not exist from
  // one that exists in a facility they cannot see.
  assert.equal(
    missing.ok === false && forbidden.ok === false && missing.reason === forbidden.reason,
    true,
  );
  assert.equal(
    f.lib.describeAssignmentReferenceRejection("OPERATION_NOT_FOUND"),
    f.lib.describeAssignmentReferenceRejection("OPERATION_DEPARTMENT_MISMATCH"),
  );
});

test("every out-of-scope operation rejection reads identically to the operator", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const messages = new Set(
    (["OPERATION_NOT_FOUND", "OPERATION_DEPARTMENT_MISMATCH", "OPERATION_DATE_MISMATCH"] as const).map(
      (reason) => f.lib.describeAssignmentReferenceRejection(reason),
    ),
  );
  assert.equal(messages.size, 1, "rejection wording distinguishes why an operation was refused");
});

test("Vendor is facility-owned, so another facility's vendor does not resolve in scope", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;

  // Mirrors the guard `createRepairAction` now applies before connecting a vendor.
  const inScope = await f.db.vendor.findFirst({
    where: { id: f.a.vendorId, facilityId: f.a.facilityId },
    select: { id: true },
  });
  const crossScope = await f.db.vendor.findFirst({
    where: { id: f.b.vendorId, facilityId: f.a.facilityId },
    select: { id: true },
  });
  const nonexistent = await f.db.vendor.findFirst({
    where: { id: "does-not-exist-anywhere", facilityId: f.a.facilityId },
    select: { id: true },
  });

  assert.equal(inScope?.id, f.a.vendorId);
  assert.equal(crossScope, null);
  // A forbidden vendor and a nonexistent one are indistinguishable to the caller.
  assert.equal(nonexistent, null);
});

test("the vendor picker lists only this facility's vendors", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;

  const listed = await f.db.vendor.findMany({
    where: { facilityId: f.a.facilityId },
    select: { id: true },
  });
  const ids = listed.map((row) => row.id);
  assert.ok(ids.includes(f.a.vendorId));
  assert.ok(!ids.includes(f.b.vendorId), "another facility's vendor appears in the picker");
});
