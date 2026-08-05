/**
 * Exercises the real SQL behind session revocation, so it needs a throwaway Postgres database that
 * has had `prisma migrate deploy` and the seed applied.
 *
 * Set SESSION_REVOCATION_TEST_DATABASE_URL to point at one. Without it the suite skips, which keeps
 * `npm test` hermetic on a fresh clone. Never point this at a database holding real data: the suite
 * creates and deletes users, employees, and facilities.
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";

import type { PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";

const TEST_DATABASE_URL = process.env.SESSION_REVOCATION_TEST_DATABASE_URL;
const skip = TEST_DATABASE_URL
  ? false
  : "set SESSION_REVOCATION_TEST_DATABASE_URL to a disposable migrated database to run these";

process.env.AUTH_SECRET ??= "session-revocation-db-test-secret";

type Fixture = {
  db: PrismaClient;
  lib: typeof import("./session-version");
  facilityId: string;
  otherFacilityId: string;
  roleStaffId: string;
  roleGmId: string;
  dietaryDepartmentId: string;
};

let fixture: Fixture | null = null;
const createdUserIds: string[] = [];
const createdEmployeeIds: string[] = [];

async function getFixture(): Promise<Fixture | null> {
  if (fixture) return fixture;
  const { PrismaClient: Client } = await import("@prisma/client");
  const db = new Client({ datasources: { db: { url: TEST_DATABASE_URL } } });

  const facilities = await db.facility.findMany({ select: { id: true }, take: 2, orderBy: { id: "asc" } });
  if (facilities.length === 0) return null;

  // A second facility is needed for the cross-facility checks. Reuse one when the seed provides
  // it, otherwise create one under the same organization.
  let otherFacilityId = facilities[1]?.id;
  if (!otherFacilityId) {
    const primary = await db.facility.findUniqueOrThrow({
      where: { id: facilities[0]!.id },
      select: { organizationId: true, timezone: true },
    });
    const created = await db.facility.create({
      data: {
        displayName: "Revocation Test Facility",
        organizationId: primary.organizationId,
        timezone: primary.timezone,
      },
      select: { id: true },
    });
    otherFacilityId = created.id;
  }

  const roleStaff = await db.role.findFirst({ where: { key: "STAFF" }, select: { id: true } });
  const roleGm = await db.role.findFirst({ where: { key: "GM" }, select: { id: true } });
  if (!roleStaff || !roleGm) return null;

  const dietary = await db.department.findFirst({
    where: { facilityId: facilities[0]!.id, key: "DIETARY" },
    select: { id: true },
  });
  if (!dietary) return null;

  fixture = {
    db,
    lib: await import("./session-version"),
    facilityId: facilities[0]!.id,
    otherFacilityId,
    roleStaffId: roleStaff.id,
    roleGmId: roleGm.id,
    dietaryDepartmentId: dietary.id,
  };
  return fixture;
}

let uniqueCounter = 0;
function unique(prefix: string) {
  uniqueCounter += 1;
  return `${prefix}-${process.pid}-${Date.now()}-${uniqueCounter}`;
}

async function makeUser(f: Fixture, overrides: { roleId?: string; isActive?: boolean } = {}) {
  const user = await f.db.user.create({
    data: {
      email: `${unique("revoke")}@example.test`,
      displayName: "Revocation Test User",
      // Not a real credential: this suite never authenticates, it only reads authority state.
      passwordHash: "not-a-usable-hash",
      facilityId: f.facilityId,
      roleId: overrides.roleId ?? f.roleStaffId,
      isActive: overrides.isActive ?? true,
    },
    select: { id: true, sessionVersion: true },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeEmployee(f: Fixture, overrides: { facilityId?: string } = {}) {
  const employee = await f.db.employee.create({
    data: {
      facilityId: overrides.facilityId ?? f.facilityId,
      firstName: "Revocation",
      lastName: "Tester",
      roleType: "STAFF",
      status: "ACTIVE",
      primaryDepartmentId:
        (overrides.facilityId ?? f.facilityId) === f.facilityId ? f.dietaryDepartmentId : null,
    },
    select: { id: true, sessionVersion: true },
  });
  createdEmployeeIds.push(employee.id);
  return employee;
}

function userSession(f: Fixture, uid: string, sessionVersion: number | undefined): AppJwtPayload {
  return {
    uid,
    authKind: "user",
    authMethod: "PASSWORD",
    role: "STAFF",
    name: "Revocation Test User",
    email: "revocation@example.test",
    facilityId: f.facilityId,
    sessionVersion,
  } as AppJwtPayload;
}

function pinSession(
  f: Fixture,
  uid: string,
  sessionVersion: number | undefined,
  overrides: { primaryDepartmentId?: string | null } = {},
): AppJwtPayload {
  return {
    uid,
    authKind: "employee",
    authMethod: "QUICK_PIN",
    role: "STAFF",
    name: "Revocation Tester",
    email: "",
    facilityId: f.facilityId,
    primaryDepartmentId:
      overrides.primaryDepartmentId === undefined
        ? f.dietaryDepartmentId
        : overrides.primaryDepartmentId,
    sessionVersion,
  } as AppJwtPayload;
}

after(async () => {
  if (!fixture) return;
  const { db } = fixture;
  if (createdEmployeeIds.length > 0) {
    await db.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
  }
  if (createdUserIds.length > 0) {
    await db.userFacilityAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await db.$disconnect();
});

test("a password session is valid before anything changes", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const user = await makeUser(f);

  const result = await f.lib.validateSessionAuthority(
    userSession(f, user.id, user.sessionVersion),
    f.db,
  );
  assert.equal(result.valid, true);
});

test("a password session fails after the password is changed", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const user = await makeUser(f);
  const session = userSession(f, user.id, user.sessionVersion);

  await f.db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: "rotated" } });
    await f.lib.revokeUserSessions(tx, user.id);
  });

  const result = await f.lib.validateSessionAuthority(session, f.db);
  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, "VERSION_STALE");
});

test("a password session fails after a role change", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const user = await makeUser(f);
  const session = userSession(f, user.id, user.sessionVersion);

  await f.db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { roleId: f.roleGmId } });
    await f.lib.revokeUserSessions(tx, user.id);
  });

  const result = await f.lib.validateSessionAuthority(session, f.db);
  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, "VERSION_STALE");
});

test("a password session fails once the user is deactivated", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const user = await makeUser(f);
  const session = userSession(f, user.id, user.sessionVersion);

  await f.db.user.update({ where: { id: user.id }, data: { isActive: false } });

  const result = await f.lib.validateSessionAuthority(session, f.db);
  assert.equal(result.valid, false);
  // Deactivation is caught even without a version bump, so a path that forgets to revoke still
  // cannot leave a deactivated account usable.
  assert.equal(result.valid === false && result.reason, "IDENTITY_INACTIVE");
});

test("a password session fails when facility access is removed", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const user = await makeUser(f);
  // Session into a facility the user does not call home and holds no grant for.
  const session = { ...userSession(f, user.id, user.sessionVersion), facilityId: f.otherFacilityId };

  const result = await f.lib.validateSessionAuthority(session, f.db);
  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, "FACILITY_ACCESS_REVOKED");
});

test("a password session keeps a facility it holds an active grant for", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const user = await makeUser(f);
  await f.db.userFacilityAccess.create({
    data: { userId: user.id, facilityId: f.otherFacilityId, isActive: true },
  });
  const session = { ...userSession(f, user.id, user.sessionVersion), facilityId: f.otherFacilityId };

  assert.equal((await f.lib.validateSessionAuthority(session, f.db)).valid, true);

  await f.db.userFacilityAccess.updateMany({
    where: { userId: user.id, facilityId: f.otherFacilityId },
    data: { isActive: false, revokedAt: new Date() },
  });

  const after = await f.lib.validateSessionAuthority(session, f.db);
  assert.equal(after.valid, false);
  assert.equal(after.valid === false && after.reason, "FACILITY_ACCESS_REVOKED");
});

test("a deleted user fails safely rather than throwing", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const user = await makeUser(f);
  const session = userSession(f, user.id, user.sessionVersion);
  await f.db.user.delete({ where: { id: user.id } });

  const result = await f.lib.validateSessionAuthority(session, f.db);
  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, "IDENTITY_NOT_FOUND");
});

test("a PIN session is valid before anything changes", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const employee = await makeEmployee(f);

  const result = await f.lib.validateSessionAuthority(
    pinSession(f, employee.id, employee.sessionVersion),
    f.db,
  );
  assert.equal(result.valid, true);
});

test("a PIN session fails after the PIN is reset", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const employee = await makeEmployee(f);
  const session = pinSession(f, employee.id, employee.sessionVersion);

  await f.db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: employee.id }, data: { pinDigest: unique("digest") } });
    await f.lib.revokeEmployeeSessions(tx, employee.id);
  });

  const result = await f.lib.validateSessionAuthority(session, f.db);
  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, "VERSION_STALE");
});

test("a PIN session fails after the PIN is removed", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const employee = await makeEmployee(f);
  const session = pinSession(f, employee.id, employee.sessionVersion);

  await f.db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: employee.id }, data: { pinDigest: null } });
    await f.lib.revokeEmployeeSessions(tx, employee.id);
  });

  assert.equal((await f.lib.validateSessionAuthority(session, f.db)).valid, false);
});

test("a PIN session fails after the employee is terminated", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const employee = await makeEmployee(f);
  const session = pinSession(f, employee.id, employee.sessionVersion);

  await f.db.employee.update({ where: { id: employee.id }, data: { status: "TERMINATED" } });

  const result = await f.lib.validateSessionAuthority(session, f.db);
  assert.equal(result.valid, false);
  // Caught by status as well as by version, so termination holds even if a caller forgets to bump.
  assert.equal(result.valid === false && result.reason, "IDENTITY_INACTIVE");
});

test("EmployeeStatus.OFF alone does not end a PIN session", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const employee = await makeEmployee(f);
  const session = pinSession(f, employee.id, employee.sessionVersion);

  await f.db.employee.update({ where: { id: employee.id }, data: { status: "OFF" } });

  // `OFF` means off shift. Signing out an employee who picked up an unscheduled shift would break
  // the behavior Phase 3 established.
  assert.equal((await f.lib.validateSessionAuthority(session, f.db)).valid, true);
});

test("a PIN session cannot be used against another facility", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const employee = await makeEmployee(f, { facilityId: f.otherFacilityId });
  const session = pinSession(f, employee.id, employee.sessionVersion, {
    primaryDepartmentId: null,
  });

  const result = await f.lib.validateSessionAuthority(session, f.db);
  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, "FACILITY_ACCESS_REVOKED");
});

test("a removed department membership drops that authority without ending the session", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const employee = await makeEmployee(f);
  const session = pinSession(f, employee.id, employee.sessionVersion);

  const before = await f.lib.validateSessionAuthority(session, f.db);
  assert.equal(before.valid, true);
  assert.equal(before.valid === true && before.effectiveDepartmentId, f.dietaryDepartmentId);

  await f.db.employee.update({
    where: { id: employee.id },
    data: { primaryDepartmentId: null },
  });

  const result = await f.lib.validateSessionAuthority(session, f.db);
  // The employee still works here, so the session survives — but it no longer carries the
  // department authority it was issued with.
  assert.equal(result.valid, true);
  assert.equal(result.valid === true && result.effectiveDepartmentId, null);
});

test("a deleted employee fails safely", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const employee = await makeEmployee(f);
  const session = pinSession(f, employee.id, employee.sessionVersion);
  await f.db.employee.delete({ where: { id: employee.id } });

  const result = await f.lib.validateSessionAuthority(session, f.db);
  assert.equal(result.valid, false);
  assert.equal(result.valid === false && result.reason, "IDENTITY_NOT_FOUND");
});

test("a token minted before the version claim existed is refused", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const user = await makeUser(f);

  const result = await f.lib.validateSessionAuthority(userSession(f, user.id, undefined), f.db);
  assert.equal(result.valid, false);
  // A missing claim cannot be compared, and assuming it current would preserve exactly the
  // sessions we cannot vouch for. The holder signs in once.
  assert.equal(result.valid === false && result.reason, "VERSION_CLAIM_MISSING");
});

test("a session issued after a revocation works with the new version", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const user = await makeUser(f);

  const newVersion = await f.lib.revokeUserSessions(f.db, user.id);
  assert.equal(newVersion, user.sessionVersion + 1);

  assert.equal((await f.lib.validateSessionAuthority(userSession(f, user.id, user.sessionVersion), f.db)).valid, false);
  assert.equal((await f.lib.validateSessionAuthority(userSession(f, user.id, newVersion), f.db)).valid, true);
});

test("repeated revocation is safe and keeps moving forward", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const employee = await makeEmployee(f);

  const first = await f.lib.revokeEmployeeSessions(f.db, employee.id);
  const second = await f.lib.revokeEmployeeSessions(f.db, employee.id);
  const third = await f.lib.revokeEmployeeSessions(f.db, employee.id);

  assert.equal(first, employee.sessionVersion + 1);
  assert.equal(second, first + 1);
  assert.equal(third, second + 1);
});

test("concurrent revocations are monotonic and never lose one", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const user = await makeUser(f);

  // Increment rather than assign, so eight racing callers produce eight increments instead of
  // overwriting each other back down to a version an old session would match.
  const concurrency = 8;
  await Promise.all(
    Array.from({ length: concurrency }, () => f.lib.revokeUserSessions(f.db, user.id)),
  );

  const after = await f.db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { sessionVersion: true },
  });
  assert.equal(after.sessionVersion, user.sessionVersion + concurrency);
});

test("a failed authority change leaves the version untouched", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const user = await makeUser(f);

  await assert.rejects(
    f.db.$transaction(async (tx) => {
      await f.lib.revokeUserSessions(tx, user.id);
      throw new Error("authority change failed after the version was incremented");
    }),
  );

  const after = await f.db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { sessionVersion: true },
  });
  // The rollback took the increment with it, so the session the caller still holds stays valid
  // rather than being half-revoked by a change that never committed.
  assert.equal(after.sessionVersion, user.sessionVersion);
  assert.equal((await f.lib.validateSessionAuthority(userSession(f, user.id, user.sessionVersion), f.db)).valid, true);
});

test("a failed revocation rolls back the authority change with it", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const user = await makeUser(f);

  await assert.rejects(
    f.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { roleId: f.roleGmId } });
      // Stand in for a revocation that fails: the identity is gone by the time it runs.
      await f.lib.revokeUserSessions(tx, `${user.id}-missing`);
    }),
  );

  const after = await f.db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { roleId: true, sessionVersion: true },
  });
  assert.equal(after.roleId, f.roleStaffId, "role change committed without its revocation");
  assert.equal(after.sessionVersion, user.sessionVersion);
});

test("bulk revocation increments every listed identity exactly once", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  const a = await makeUser(f);
  const b = await makeUser(f);

  const count = await f.lib.revokeUserSessionsMany(f.db, [a.id, b.id]);
  assert.equal(count, 2);

  const rows = await f.db.user.findMany({
    where: { id: { in: [a.id, b.id] } },
    select: { id: true, sessionVersion: true },
  });
  for (const row of rows) {
    assert.equal(row.sessionVersion, 1);
  }
});

test("bulk revocation with an empty list is a no-op", { skip }, async () => {
  const f = await getFixture();
  if (!f) return;
  assert.equal(await f.lib.revokeUserSessionsMany(f.db, []), 0);
  assert.equal(await f.lib.revokeEmployeeSessionsMany(f.db, []), 0);
});
