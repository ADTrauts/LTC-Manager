import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";
import { confirmEmployeeCsv, previewEmployeeCsv } from "./service";

const url = process.env.BULK_IMPORT_TEST_DATABASE_URL;
const secret = "onb01-disposable-review-secret";
const skip = url ? false : "Set BULK_IMPORT_TEST_DATABASE_URL to a migrated disposable database.";
if (url) assertDisposableDatabaseUrl(url);

async function fixture(db: PrismaClient) {
  const suffix = randomUUID();
  const managerRole = await db.role.upsert({ where: { key: "MANAGER" }, create: { key: "MANAGER", name: "Manager" }, update: {} });
  const staffRole = await db.role.upsert({ where: { key: "STAFF" }, create: { key: "STAFF", name: "Staff" }, update: {} });
  const org = await db.organization.create({ data: { name: `ONB01 ${suffix}` } });
  const facility = await db.facility.create({ data: { organizationId: org.id, displayName: `ONB01 ${suffix}`, timezone: "America/New_York" } });
  const actor = await db.user.create({ data: { email: `manager-${suffix}@example.com`, displayName: "Manager", facilityId: facility.id, roleId: managerRole.id, isActive: true } });
  const grant = await db.userFacilityAccess.create({ data: { userId: actor.id, facilityId: facility.id, rolePeriods: { create: { roleKey: "MANAGER", startsAt: new Date("2020-01-01") } } } });
  const targetUser = await db.user.create({ data: { email: `person-${suffix}@example.com`, displayName: "Person", facilityId: facility.id, roleId: staffRole.id, isActive: true } });
  const unit = await db.unit.create({ data: { facilityId: facility.id, name: "North", unitType: "OTHER", displayOrder: 1 } });
  const employee = await db.employee.create({ data: {
    facilityId: facility.id, userId: targetUser.id, firstName: "Jane", lastName: "Doe", email: targetUser.email,
    phone: "555-1234", roleType: "STAFF", status: "OFF", employmentType: "PART_TIME", unionMember: true, onLeave: true,
    hireDate: new Date("2024-01-15"), birthMonth: 3, birthDay: 15, jobClassification: "COOK", chrcStatus: "CLEARED",
    chrcClearedAt: new Date("2024-01-20"), chrcNotes: "Reviewed", shirtSize: "M", hrNotes: "Retain notes",
    primaryUnitId: unit.id, pinDigest: `test-digest-${suffix}`, sessionVersion: 7,
    workStations: { create: [{ station: "COOK" }, { station: "SERVER" }] },
  } });
  const session = { uid: actor.id, authKind: "user", authMethod: "PASSWORD", scopeKind: "facility", role: "MANAGER", facilityId: facility.id, sessionVersion: 0, name: "Manager", email: actor.email } as FacilitySession;
  const source = (body: string) => ({ text: body, fileName: "updates.csv" });
  const snapshot = () => db.employee.findUniqueOrThrow({ where: { id: employee.id }, include: { workStations: { orderBy: { station: "asc" } }, terminationRecords: true } });
  return { facility, actor, grant, targetUser, unit, employee, session, source, snapshot };
}

async function run(body: (db: PrismaClient) => Promise<void>) {
  const db = new PrismaClient({ datasources: { db: { url: url! } } });
  try { await body(db); } finally { await db.$disconnect(); }
}

test("SQL: names-only and blank-column previews do not write; confirmation preserves every unprovided fact", { skip }, () => run(async (db) => {
  const f = await fixture(db);
  const before = await f.snapshot();
  const userBefore = await db.user.findUniqueOrThrow({ where: { id: f.targetUser.id } });
  const src = f.source("firstName,lastName,email,roleType,status,employmentType,workStations\nJane,Doe,,,,,");
  const preview = await previewEmployeeCsv(db, f.session, src, secret);
  assert.equal(preview.rows[0]!.status, "unchanged");
  assert.deepEqual(await f.snapshot(), before);
  assert.equal(await db.employeeHrAuditLog.count({ where: { facilityId: f.facility.id } }), 0);
  const result = await confirmEmployeeCsv(db, f.session, src, preview.reviewToken, secret);
  assert.equal(result.unchanged, 1);
  assert.deepEqual(await f.snapshot(), before);
  assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: f.targetUser.id } }), userBefore);
  const edit = f.source(`employeeId,phone\n${f.employee.id},555-9999`);
  const p = await previewEmployeeCsv(db, f.session, edit, secret);
  assert.equal(p.rows[0]!.changes[0]!.before, "555-1234");
  assert.equal((await confirmEmployeeCsv(db, f.session, edit, p.reviewToken, secret)).committed, 1);
  const after = await f.snapshot();
  assert.deepEqual({ ...after, phone: before.phone, updatedAt: before.updatedAt }, before);
  assert.equal(await db.employeeHrAuditLog.count({ where: { employeeId: f.employee.id, fieldKey: "profile.phone", userId: f.actor.id } }), 1);
  const receipt = await db.employeeHrAuditLog.findFirstOrThrow({ where: { employeeId: f.employee.id, fieldKey: "import.employeeCsv.receipt" } });
  const provenance = JSON.parse(receipt.newValue!);
  assert.equal(provenance.fileName, edit.fileName);
  assert.equal(provenance.row, 2);
  assert.equal(provenance.sourceHash, p.sourceHash);
  assert.deepEqual(provenance.columns, [{ field: "phone", column: 2, header: "phone" }]);
  assert.ok(!receipt.newValue!.includes(f.employee.pinDigest!));
}));

test("SQL: clears are previewed, allowlisted and atomic; retries are unchanged without duplicate audit", { skip }, () => run(async (db) => {
  const f = await fixture(db);
  const src = f.source(`employeeId,phone,workStations,birthMonth,birthDay,onLeave\n${f.employee.id},__CLEAR__,__CLEAR__,__CLEAR__,__CLEAR__,false`);
  const p = await previewEmployeeCsv(db, f.session, src, secret);
  assert.equal(p.rows[0]!.changes.filter((change) => change.clear).length, 4);
  assert.equal((await f.snapshot()).phone, "555-1234");
  const result = await confirmEmployeeCsv(db, f.session, src, p.reviewToken, secret);
  assert.equal(result.committed, 1);
  const after = await f.snapshot();
  assert.equal(after.phone, null); assert.equal(after.birthMonth, null); assert.deepEqual(after.workStations, []); assert.equal(after.onLeave, false);
  assert.equal(after.roleType, "STAFF"); assert.equal(after.status, "OFF"); assert.equal(after.sessionVersion, 7); assert.equal(after.pinDigest, f.employee.pinDigest);
  const count = await db.employeeHrAuditLog.count({ where: { employeeId: f.employee.id } });
  assert.equal((await confirmEmployeeCsv(db, f.session, src, p.reviewToken, secret)).unchanged, 1);
  assert.equal(await db.employeeHrAuditLog.count({ where: { employeeId: f.employee.id } }), count);
  const invalid = await previewEmployeeCsv(db, f.session, f.source(`employeeId,birthMonth\n${f.employee.id},4`), secret);
  assert.equal(invalid.rows[0]!.status, "blocked");
}));

test("SQL: scoped matching refuses duplicates, mismatched email, unmatched email and cross-Facility IDs", { skip }, () => run(async (db) => {
  const f = await fixture(db);
  const other = await db.employee.create({ data: { facilityId: f.facility.id, firstName: "Jane", lastName: "Doe", email: "another@example.com", roleType: "STAFF" } });
  for (const body of [
    "firstName,lastName,phone\nJane,Doe,555-0000",
    "firstName,lastName,email,phone\nJane,Doe,missing@example.com,555-0000",
    `employeeId,email\n${f.employee.id},${other.email}`,
    `employeeId,phone\n${f.employee.id},changed\n${f.employee.id},twice`,
    `employeeId,email\n${f.employee.id},proposed@example.com\n${other.id},proposed@example.com`,
  ]) {
    const src = f.source(body), p = await previewEmployeeCsv(db, f.session, src, secret);
    assert.ok(p.rows.every((row) => row.status === "blocked"));
    assert.equal((await confirmEmployeeCsv(db, f.session, src, p.reviewToken, secret)).committed, 0);
  }
  assert.equal(await db.employee.count({ where: { facilityId: f.facility.id } }), 2, "unmatched rows never create employees");
  const foreign = await fixture(db);
  const p = await previewEmployeeCsv(db, foreign.session, foreign.source(`employeeId,phone\n${f.employee.id},stolen`), secret);
  assert.equal(p.rows[0]!.employeeId, null);
  assert.equal(p.rows[0]!.status, "blocked");
  const valid = f.source(`employeeId,phone\n${f.employee.id},555-0000`), review = await previewEmployeeCsv(db, f.session, valid, secret);
  await assert.rejects(() => confirmEmployeeCsv(db, foreign.session, valid, review.reviewToken, secret), /Facility|actor/);
  assert.equal((await f.snapshot()).phone, "555-1234");
}));

test("SQL: lifecycle, authority, email-credential and history changes are blocked without session effects", { skip }, () => run(async (db) => {
  const f = await fixture(db);
  const snapshot = await f.snapshot();
  for (const field of ["roleType", "status", "terminationDate", "chrcOffboardingNotes"]) {
    const value = ({ roleType: "MANAGER", status: "TERMINATED", terminationDate: "2026-10-01", chrcOffboardingNotes: "rewrite" } as Record<string, string>)[field];
    const src = f.source(`employeeId,${field},phone\n${f.employee.id},${value},555-9999`);
    const p = await previewEmployeeCsv(db, f.session, src, secret);
    assert.equal(p.rows[0]!.status, "blocked");
    assert.equal((await confirmEmployeeCsv(db, f.session, src, p.reviewToken, secret)).blocked, 1);
  }
  assert.deepEqual(await f.snapshot(), snapshot);
  await db.employee.update({ where: { id: f.employee.id }, data: { status: "TERMINATED", terminationDate: new Date("2026-09-01") } });
  const reactivate = await previewEmployeeCsv(db, f.session, f.source(`employeeId,status\n${f.employee.id},ACTIVE`), secret);
  assert.equal(reactivate.rows[0]!.status, "blocked");
  const grant = await db.userFacilityAccess.create({ data: { userId: f.targetUser.id, facilityId: f.facility.id, rolePeriods: { create: { roleKey: "MANAGER", startsAt: new Date("2020-01-01") } } } });
  assert.ok(grant.id);
  const clear = await previewEmployeeCsv(db, f.session, f.source(`employeeId,email\n${f.employee.id},__CLEAR__`), secret);
  assert.equal(clear.rows[0]!.status, "blocked", "effective grant role, not just Employee roleType, protects required email");
  assert.equal(await db.employeeHrAuditLog.count({ where: { employeeId: f.employee.id } }), 0);
}));

test("SQL: altered/expired reviews, changed files and revoked sessions cannot mutate", { skip }, () => run(async (db) => {
  const f = await fixture(db), src = f.source(`employeeId,phone\n${f.employee.id},555-9999`);
  const p = await previewEmployeeCsv(db, f.session, src, secret);
  await assert.rejects(() => confirmEmployeeCsv(db, f.session, src, p.reviewToken + "x", secret), /Review|review/);
  await assert.rejects(() => confirmEmployeeCsv(db, f.session, f.source(src.text + "0"), p.reviewToken, secret), /file/);
  await assert.rejects(() => confirmEmployeeCsv(db, f.session, src, p.reviewToken, secret, new Date(Date.now() + 31 * 60_000)), /expired/);
  await assert.rejects(() => confirmEmployeeCsv(db, f.session, src, "", secret), /preview/);
  await assert.rejects(() => previewEmployeeCsv(db, f.session, { ...src, contractVersion: "future/2" }, secret), /Unsupported/);
  await db.user.update({ where: { id: f.actor.id }, data: { sessionVersion: { increment: 1 } } });
  assert.equal((await confirmEmployeeCsv(db, f.session, src, p.reviewToken, secret)).blocked, 1);
  assert.equal((await f.snapshot()).phone, "555-1234");
  assert.equal(await db.employeeHrAuditLog.count({ where: { employeeId: f.employee.id } }), 0);
}));

test("SQL: stale target, changed matching ambiguity, membership and location dependencies require renewed review", { skip }, () => run(async (db) => {
  const f = await fixture(db), src = f.source(`employeeId,phone\n${f.employee.id},555-9999`);
  const p = await previewEmployeeCsv(db, f.session, src, secret);
  await db.employee.update({ where: { id: f.employee.id }, data: { hrNotes: "Newer edit" } });
  assert.equal((await confirmEmployeeCsv(db, f.session, src, p.reviewToken, secret)).blocked, 1);
  const names = f.source("firstName,lastName,phone\nJane,Doe,555-8888"), p2 = await previewEmployeeCsv(db, f.session, names, secret);
  await db.employee.create({ data: { facilityId: f.facility.id, firstName: "Jane", lastName: "Doe", roleType: "STAFF" } });
  assert.equal((await confirmEmployeeCsv(db, f.session, names, p2.reviewToken, secret)).blocked, 1);
  const p3 = await previewEmployeeCsv(db, f.session, src, secret);
  await db.employeeWorkStation.create({ data: { employeeId: f.employee.id, station: "PORTER" } });
  assert.equal((await confirmEmployeeCsv(db, f.session, src, p3.reviewToken, secret)).blocked, 1);
  const unitSource = f.source(`employeeId,primaryUnit,phone\n${f.employee.id},North,555-9999`), p4 = await previewEmployeeCsv(db, f.session, unitSource, secret);
  await db.unit.update({ where: { id: f.unit.id }, data: { isActive: false } });
  assert.equal((await confirmEmployeeCsv(db, f.session, unitSource, p4.reviewToken, secret)).blocked, 1);
  assert.equal((await f.snapshot()).phone, "555-1234");
}));

test("SQL: concurrent target writer cannot be overwritten between review check and row commit", { skip }, () => run(async (db) => {
  const f = await fixture(db), src = f.source(`employeeId,phone\n${f.employee.id},555-9999`);
  const p = await previewEmployeeCsv(db, f.session, src, secret);
  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const hasLock = new Promise<void>((resolve) => { locked = resolve; });
  const writer = db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: f.employee.id }, data: { phone: "concurrent edit" } });
    locked(); await gate;
  }, { timeout: 10_000 });
  await hasLock;
  const confirmation = confirmEmployeeCsv(db, f.session, src, p.reviewToken, secret);
  await new Promise((resolve) => setTimeout(resolve, 80));
  release(); await writer;
  const result = await confirmation;
  assert.equal(result.committed, 0);
  assert.equal(result.blocked + result.failed, 1);
  assert.equal((await f.snapshot()).phone, "concurrent edit");
  assert.equal(await db.employeeHrAuditLog.count({ where: { employeeId: f.employee.id } }), 0);
}));

test("SQL: per-row rollback includes audit failure; partial commits and safe retries are reported", { skip }, () => run(async (db) => {
  const f = await fixture(db);
  const other = await db.employee.create({ data: { facilityId: f.facility.id, firstName: "John", lastName: "Doe", roleType: "STAFF", phone: "original" } });
  const src = f.source(`employeeId,phone\n${f.employee.id},555-9999\n${other.id},__CLEAR__`);
  const p = await previewEmployeeCsv(db, f.session, src, secret);
  // Real SQL trigger injection in the disposable DB proves employee update and audit roll back together.
  const triggerName = `onb_fail_${randomUUID().replaceAll("-", "")}`;
  await db.$executeRawUnsafe(`CREATE FUNCTION "${triggerName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."employeeId" = '${other.id}' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "EmployeeHrAuditLog" FOR EACH ROW EXECUTE FUNCTION "${triggerName}"()`);
  const result = await confirmEmployeeCsv(db, f.session, src, p.reviewToken, secret);
  assert.equal(result.committed, 1); assert.equal(result.failed, 1);
  assert.equal((await f.snapshot()).phone, "555-9999");
  assert.equal((await db.employee.findUniqueOrThrow({ where: { id: other.id } })).phone, "original");
  assert.equal(await db.employeeHrAuditLog.count({ where: { employeeId: other.id } }), 0);
  // Disable only our own injected trigger, preserving the disposable evidence for inspection.
  await db.$executeRaw(Prisma.raw(`ALTER TABLE "EmployeeHrAuditLog" DISABLE TRIGGER "${triggerName}"`));
  const next = await previewEmployeeCsv(db, f.session, src, secret);
  const retry = await confirmEmployeeCsv(db, f.session, src, next.reviewToken, secret);
  assert.equal(retry.unchanged, 1); assert.equal(retry.committed, 1);
}));

test("SQL: revoked Facility grants and changed effective roles are rejected live", { skip }, () => run(async (db) => {
  for (const kind of ["grant", "role"] as const) {
    const f = await fixture(db), src = f.source(`employeeId,phone\n${f.employee.id},555-9999`);
    const preview = await previewEmployeeCsv(db, f.session, src, secret);
    if (kind === "grant") await db.userFacilityAccess.update({ where: { id: f.grant.id }, data: { isActive: false, revokedAt: new Date() } });
    else await db.userFacilityRolePeriod.updateMany({ where: { userFacilityAccessId: f.grant.id }, data: { roleKey: "STAFF" } });
    const result = await confirmEmployeeCsv(db, f.session, src, preview.reviewToken, secret);
    assert.equal(result.blocked, 1); assert.equal(result.committed, 0);
    assert.equal((await f.snapshot()).phone, "555-1234");
    assert.equal(await db.employeeHrAuditLog.count({ where: { employeeId: f.employee.id } }), 0);
  }
}));

test("SQL: employment end after preview preserves revoked PIN/grant, global identity and separation history", { skip }, () => run(async (db) => {
  const { endEmployeeEmployment } = await import("@/lib/employee-identity/lifecycle");
  const { buildTerminationSnapshotJson } = await import("@/lib/hr-audit");
  const f = await fixture(db), src = f.source(`employeeId,phone\n${f.employee.id},555-9999`);
  const targetGrant = await db.userFacilityAccess.create({ data: { userId: f.targetUser.id, facilityId: f.facility.id, rolePeriods: { create: { roleKey: "STAFF", startsAt: new Date("2020-01-01") } } } });
  const sibling = await db.facility.create({ data: { organizationId: f.facility.organizationId, displayName: "Sibling" } });
  const otherEmployment = await db.employee.create({ data: { facilityId: sibling.id, userId: f.targetUser.id, firstName: "Jane", lastName: "Doe", roleType: "STAFF", sessionVersion: 9 } });
  const preview = await previewEmployeeCsv(db, f.session, src, secret);
  await db.$transaction(async (tx) => {
    await endEmployeeEmployment(tx, { employeeId: f.employee.id, facilityId: f.facility.id, actorUserId: f.actor.id, terminationDate: new Date("2026-10-01") });
    const separated = await tx.employee.findUniqueOrThrow({ where: { id: f.employee.id }, include: { workStations: true } });
    await tx.employeeTerminationRecord.create({ data: { facilityId: f.facility.id, employeeId: f.employee.id, terminatedAt: new Date("2026-10-01"), snapshotJson: buildTerminationSnapshotJson(separated), createdByUserId: f.actor.id } });
  });
  const separated = await f.snapshot();
  assert.equal(separated.sessionVersion, 8); assert.equal(separated.status, "TERMINATED");
  assert.equal((await confirmEmployeeCsv(db, f.session, src, preview.reviewToken, secret)).blocked, 1);
  assert.deepEqual(await f.snapshot(), separated);
  const afterEndReview = await previewEmployeeCsv(db, f.session, src, secret);
  assert.equal((await confirmEmployeeCsv(db, f.session, src, afterEndReview.reviewToken, secret)).committed, 1);
  const updatedContact = await f.snapshot();
  assert.deepEqual({ ...updatedContact, phone: separated.phone, updatedAt: separated.updatedAt }, separated,
    "a separately reviewed contact edit preserves termination snapshots and revoked PIN authority");
  assert.equal((await db.userFacilityAccess.findUniqueOrThrow({ where: { id: targetGrant.id } })).isActive, false);
  const user = await db.user.findUniqueOrThrow({ where: { id: f.targetUser.id } });
  assert.equal(user.isActive, true); assert.equal(user.sessionVersion, 0);
  assert.deepEqual(await db.employee.findUniqueOrThrow({ where: { id: otherEmployment.id } }), otherEmployment);
}));

test("SQL: date-only no-ops preserve stored timestamps; contact email edits never change global identity", { skip }, () => run(async (db) => {
  const f = await fixture(db);
  await db.employee.update({ where: { id: f.employee.id }, data: { chrcClearedAt: new Date("2024-01-20T12:45:00Z") } });
  const before = await f.snapshot(), userBefore = await db.user.findUniqueOrThrow({ where: { id: f.targetUser.id } });
  const daySource = f.source(`employeeId,chrcClearedAt,hireDate\n${f.employee.id},2024-01-20,2024-01-15`);
  const days = await previewEmployeeCsv(db, f.session, daySource, secret);
  assert.equal((await confirmEmployeeCsv(db, f.session, daySource, days.reviewToken, secret)).unchanged, 1);
  assert.deepEqual(await f.snapshot(), before);
  for (const email of ["new-contact@example.com", "__CLEAR__"]) {
    const src = f.source(`employeeId,email\n${f.employee.id},${email}`), p = await previewEmployeeCsv(db, f.session, src, secret);
    assert.equal(p.rows[0]!.changes[0]!.clear, email === "__CLEAR__");
    assert.equal((await confirmEmployeeCsv(db, f.session, src, p.reviewToken, secret)).committed, 1);
  }
  const after = await f.snapshot();
  assert.equal(after.email, null); assert.equal(after.userId, userBefore.id); assert.equal(after.sessionVersion, before.sessionVersion);
  assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: f.targetUser.id } }), userBefore);
  await assert.rejects(() => previewEmployeeCsv(db, f.session, f.source("é".repeat(1_000_001)), secret), /File too large/);
}));

test("SQL: a time-effective Manager role expiring during a row-lock wait cannot authorize the write", { skip }, () => run(async (db) => {
  const f = await fixture(db), src = f.source(`employeeId,phone\n${f.employee.id},555-9999`);
  const expires = new Date(Date.now() + 2000);
  await db.userFacilityRolePeriod.updateMany({ where: { userFacilityAccessId: f.grant.id }, data: { endsAt: expires } });
  await db.userFacilityRolePeriod.create({ data: { userFacilityAccessId: f.grant.id, roleKey: "STAFF", startsAt: expires } });
  const preview = await previewEmployeeCsv(db, f.session, src, secret);
  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const hasLock = new Promise<void>((resolve) => { locked = resolve; });
  const holder = db.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Employee" WHERE "id" = ${f.employee.id} FOR UPDATE`);
    locked(); await gate;
  }, { timeout: 10_000 });
  await hasLock;
  const confirmation = confirmEmployeeCsv(db, f.session, src, preview.reviewToken, secret);
  await new Promise((resolve) => setTimeout(resolve, Math.max(1, expires.getTime() - Date.now() + 100)));
  release(); await holder;
  const result = await confirmation;
  assert.equal(result.committed, 0); assert.equal(result.blocked, 1);
  assert.equal((await f.snapshot()).phone, "555-1234");
  assert.equal(await db.employeeHrAuditLog.count({ where: { employeeId: f.employee.id } }), 0);
}));
