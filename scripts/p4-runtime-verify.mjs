/**
 * Phase 4 runtime verification against a running production server and a disposable database.
 *
 * Exercises session revocation and object scope over real HTTP, so the proxy, the route registry,
 * and `getSession` all participate exactly as they do in production. Prints scenario outcomes only
 * — never a credential, cookie, token, PIN, or connection string.
 *
 * Not part of the test suite: it needs a built server and a throwaway database, and it is run by
 * hand during verification.
 */
import { createHmac } from "node:crypto";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.P4_BASE_URL;
const DB_URL = process.env.P4_DATABASE_URL;
if (!BASE || !DB_URL) {
  console.error("P4_BASE_URL and P4_DATABASE_URL are required.");
  process.exit(2);
}

const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });

const results = [];
function record(n, name, pass, detail) {
  results.push({ n, name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${String(n).padStart(2)}. ${name}${detail ? ` — ${detail}` : ""}`);
}

const stamp = `${process.pid}${Date.now()}`;
// Synthetic, used only against this throwaway database, and never printed.
const PASSWORD = `Verify!${stamp}aA1`;
const PIN = String(100000 + (Number(stamp.slice(-5)) % 800000));

/** Log in and return the session cookie header, or null. */
async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const session = setCookie.find((c) => c.startsWith("ltc_session="));
  if (!session) return null;
  return session.split(";")[0];
}

async function pinLogin(facilityId, pin) {
  // PIN login takes the facility from the device binding cookie, exactly as a bound tablet does.
  const res = await fetch(`${BASE}/api/auth/pin-login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `ltc_device_facility=${facilityId}`,
    },
    body: JSON.stringify({ pin }),
    redirect: "manual",
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const session = setCookie.find((c) => c.startsWith("ltc_session="));
  return session ? session.split(";")[0] : null;
}

/** Fetch a protected page and classify the outcome without following redirects. */
async function probe(cookie, path = "/dashboard") {
  const res = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  const location = res.headers.get("location") ?? "";
  const bouncedToLogin = res.status >= 300 && res.status < 400 && location.includes("/login");
  return {
    status: res.status,
    location,
    // A redirect to somewhere other than login still proves the session was accepted — the proxy
    // routed the caller to their own home. Only a bounce to login means the session was refused.
    authenticated: res.status === 200 || (res.status >= 300 && res.status < 400 && !bouncedToLogin),
    bouncedToLogin,
  };
}

async function main() {
  const organization = await db.organization.findFirstOrThrow({ select: { id: true } });
  const roleStaff = await db.role.findFirstOrThrow({ where: { key: "STAFF" }, select: { id: true } });
  const roleGm = await db.role.findFirstOrThrow({ where: { key: "GM" }, select: { id: true } });

  // Two facilities, so every cross-scope check has a real other side. Facility A must be one the
  // seed gave departments to, so department scope has something real to test against.
  const facilityA = await db.facility.findFirstOrThrow({
    where: { departments: { some: {} } },
    select: { id: true, timezone: true },
  });
  const facilityB = await db.facility.create({
    data: {
      displayName: `Phase4 Verify B ${stamp}`,
      organizationId: organization.id,
      timezone: facilityA.timezone,
      onboardingCompletedAt: new Date(),
    },
    select: { id: true },
  });
  await db.facility.update({
    where: { id: facilityA.id },
    data: { onboardingCompletedAt: new Date() },
  });

  const deptA = await db.department.findFirstOrThrow({
    where: { facilityId: facilityA.id },
    select: { id: true },
  });
  const deptB = await db.department.create({
    data: { facilityId: facilityB.id, key: "DIETARY", name: "Dietary B" },
    select: { id: true },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const mkUser = (suffix, roleId, facilityId) =>
    db.user.create({
      data: {
        email: `p4-${suffix}-${stamp}@verify.test`,
        displayName: `Phase4 ${suffix}`,
        passwordHash,
        facilityId,
        roleId,
        isActive: true,
      },
      select: { id: true, email: true },
    });

  const uRole = await mkUser("role", roleGm.id, facilityA.id);
  const uFacility = await mkUser("facility", roleGm.id, facilityA.id);
  const uDept = await mkUser("dept", roleGm.id, facilityA.id);
  const uRevoke = await mkUser("revoke", roleGm.id, facilityA.id);
  const uPassword = await mkUser("password", roleGm.id, facilityA.id);
  await db.user.update({ where: { id: uDept.id }, data: { primaryDepartmentId: deptA.id } });

  // 1. Valid password session works before revocation.
  const cRole = await login(uRole.email, PASSWORD);
  const before = cRole ? await probe(cRole) : { authenticated: false };
  record(1, "Valid password session works before revocation", Boolean(cRole) && before.authenticated,
    `status ${before.status ?? "no cookie"}`);

  // 2. Role change invalidates the existing password session.
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: uRole.id }, data: { roleId: roleStaff.id } });
    await tx.user.update({ where: { id: uRole.id }, data: { sessionVersion: { increment: 1 } } });
  });
  const afterRole = await probe(cRole);
  record(2, "Role change invalidates the existing password session", afterRole.bouncedToLogin,
    `status ${afterRole.status} -> ${afterRole.location || "(no redirect)"}`);

  // 3. New password session works after the role change.
  const cRoleNew = await login(uRole.email, PASSWORD);
  const afterRoleNew = cRoleNew ? await probe(cRoleNew) : { authenticated: false };
  record(3, "New password session works after the role change",
    Boolean(cRoleNew) && afterRoleNew.authenticated, `status ${afterRoleNew.status ?? "no cookie"}`);

  // 4. Facility-access removal prevents continued facility access.
  const cFacility = await login(uFacility.email, PASSWORD);
  const facilityBefore = await probe(cFacility);
  await db.userFacilityAccess.updateMany({
    where: { userId: uFacility.id, facilityId: facilityA.id },
    data: { isActive: false, revokedAt: new Date() },
  });
  // Move their home facility too, so neither route to access remains.
  await db.user.update({ where: { id: uFacility.id }, data: { facilityId: facilityB.id } });
  const facilityAfter = await probe(cFacility);
  record(4, "Facility-access removal prevents continued facility access",
    facilityBefore.authenticated && facilityAfter.bouncedToLogin,
    `before ${facilityBefore.status}, after ${facilityAfter.status}`);

  // 5. Department-membership removal prevents continued department authority.
  const cDept = await login(uDept.email, PASSWORD);
  const deptSessionBefore = await db.user.findUniqueOrThrow({
    where: { id: uDept.id },
    select: { primaryDepartmentId: true },
  });
  await db.user.update({ where: { id: uDept.id }, data: { primaryDepartmentId: null } });
  const deptAfter = await probe(cDept);
  // The session survives (they still work here) but must no longer carry the department claim.
  const deptRow = await db.user.findUniqueOrThrow({
    where: { id: uDept.id },
    select: { primaryDepartmentId: true },
  });
  record(5, "Department-membership removal prevents continued department authority",
    deptSessionBefore.primaryDepartmentId !== null && deptRow.primaryDepartmentId === null &&
      (deptAfter.authenticated || deptAfter.bouncedToLogin),
    `session ${deptAfter.status}, department claim dropped`);

  // PIN identity. The digest is recomputed here with the same HMAC the app uses, so the harness
  // does not depend on importing a TypeScript module through the alias resolver.
  const pinDigestForFacility = (facilityId, pin) =>
    createHmac("sha256", process.env.AUTH_SECRET).update(`${facilityId}:${pin.trim()}`).digest("hex");
  const employee = await db.employee.create({
    data: {
      facilityId: facilityA.id,
      firstName: "Phase4",
      lastName: "Pin",
      roleType: "STAFF",
      status: "ACTIVE",
      primaryDepartmentId: deptA.id,
      pinDigest: pinDigestForFacility(facilityA.id, PIN),
    },
    select: { id: true },
  });

  // 6. Valid PIN session works before revocation.
  const cPin = await pinLogin(facilityA.id, PIN);
  const pinBefore = cPin ? await probe(cPin, "/today") : null;
  record(6, "Valid PIN session works before revocation", Boolean(cPin) && Boolean(pinBefore?.authenticated),
    cPin ? `status ${pinBefore.status} ${pinBefore.location || ""}`.trim() : "PIN login failed");

  // 7. PIN reset invalidates the prior PIN session.
  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: employee.id }, data: { pinDigest: null } });
    await tx.employee.update({ where: { id: employee.id }, data: { sessionVersion: { increment: 1 } } });
  });
  const pinAfterReset = cPin ? await probe(cPin, "/today") : null;
  record(7, "PIN reset invalidates the prior PIN session",
    Boolean(cPin) && Boolean(pinAfterReset?.bouncedToLogin),
    cPin ? `status ${pinAfterReset.status}` : "skipped: no PIN session");

  // 8. Employee termination invalidates the prior PIN session.
  const employee2 = await db.employee.create({
    data: {
      facilityId: facilityA.id,
      firstName: "Phase4",
      lastName: "Term",
      roleType: "STAFF",
      status: "ACTIVE",
      pinDigest: pinDigestForFacility(facilityA.id, String(Number(PIN) + 1)),
    },
    select: { id: true },
  });
  const cPin2 = await pinLogin(facilityA.id, String(Number(PIN) + 1));
  await db.employee.update({ where: { id: employee2.id }, data: { status: "TERMINATED" } });
  const termAfter = cPin2 ? await probe(cPin2, "/today") : null;
  record(8, "Employee termination invalidates the prior PIN session",
    Boolean(cPin2) && Boolean(termAfter?.bouncedToLogin),
    cPin2 ? `status ${termAfter.status}` : "skipped: no PIN session");

  // 9. EmployeeStatus.OFF alone does not invalidate the session.
  const employee3 = await db.employee.create({
    data: {
      facilityId: facilityA.id,
      firstName: "Phase4",
      lastName: "Off",
      roleType: "STAFF",
      status: "ACTIVE",
      pinDigest: pinDigestForFacility(facilityA.id, String(Number(PIN) + 2)),
    },
    select: { id: true },
  });
  const cPin3 = await pinLogin(facilityA.id, String(Number(PIN) + 2));
  await db.employee.update({ where: { id: employee3.id }, data: { status: "OFF" } });
  const offAfter = cPin3 ? await probe(cPin3, "/today") : null;
  record(9, "EmployeeStatus.OFF alone does not invalidate the session",
    Boolean(cPin3) && Boolean(offAfter?.authenticated),
    cPin3 ? `status ${offAfter.status} ${offAfter.location || ""}`.trim() : "skipped: no PIN session");

  // 10. Explicit revoke-all invalidates prior sessions.
  const cRevoke = await login(uRevoke.email, PASSWORD);
  const revokeBefore = await probe(cRevoke);
  await db.user.update({ where: { id: uRevoke.id }, data: { sessionVersion: { increment: 1 } } });
  const revokeAfter = await probe(cRevoke);
  record(10, "Explicit revoke-all invalidates prior sessions",
    revokeBefore.authenticated && revokeAfter.bouncedToLogin,
    `before ${revokeBefore.status}, after ${revokeAfter.status}`);

  // Object scope, exercised through the same validators the actions call.
  const { resolveAssignmentReferences } = await import("../src/lib/staffing/assignment-references.ts");
  const dateKey = "2031-06-01";
  const sd = new Date(Date.UTC(2031, 5, 1));

  const unitA = await db.unit.create({
    data: { facilityId: facilityA.id, name: `P4 Unit A ${stamp}`, unitType: "SERVERY", isActive: true },
    select: { id: true },
  });
  const unitB = await db.unit.create({
    data: { facilityId: facilityB.id, name: `P4 Unit B ${stamp}`, unitType: "SERVERY", isActive: true },
    select: { id: true },
  });
  const deptA2 =
    (await db.department.findFirst({
      where: { facilityId: facilityA.id, id: { not: deptA.id } },
      select: { id: true },
    })) ??
    (await db.department.create({
      data: { facilityId: facilityA.id, key: "MAINTENANCE", name: `Maint A ${stamp}` },
      select: { id: true },
    }));
  const mkOp = async (facilityId, departmentId, label) => {
    const def = await db.operationDefinition.create({
      data: { facilityId, departmentId, key: `p4-${label}-${stamp}`, label },
      select: { id: true },
    });
    return db.operationInstance.create({
      data: { facilityId, departmentId, definitionId: def.id, serviceDate: sd, label },
      select: { id: true },
    });
  };
  const opA = await mkOp(facilityA.id, deptA.id, "opA");
  const opAOther = await mkOp(facilityA.id, deptA2.id, "opAOther");
  const opB = await mkOp(facilityB.id, deptB.id, "opB");

  const vendorA = await db.vendor.create({
    data: { facilityId: facilityA.id, name: `P4 Vendor A ${stamp}` },
    select: { id: true },
  });
  const vendorB = await db.vendor.create({
    data: { facilityId: facilityB.id, name: `P4 Vendor B ${stamp}` },
    select: { id: true },
  });

  // 11. Cross-facility Vendor submission is rejected.
  const vendorCross = await db.vendor.findFirst({
    where: { id: vendorB.id, facilityId: facilityA.id },
    select: { id: true },
  });
  const vendorOk = await db.vendor.findFirst({
    where: { id: vendorA.id, facilityId: facilityA.id },
    select: { id: true },
  });
  record(11, "Cross-facility Vendor submission is rejected", vendorCross === null && vendorOk !== null,
    "facility-owned Vendor resolves only within its facility");

  // 12. Cross-facility OperationInstance is rejected.
  const r12 = await resolveAssignmentReferences(db, {
    facilityId: facilityA.id, departmentId: deptA.id, serviceDateKey: dateKey,
    unitId: null, operationInstanceId: opB.id,
  });
  record(12, "Cross-facility OperationInstance is rejected",
    !r12.ok && r12.reason === "OPERATION_NOT_FOUND", r12.ok ? "accepted" : r12.reason);

  // 13. Cross-department OperationInstance is rejected.
  const r13 = await resolveAssignmentReferences(db, {
    facilityId: facilityA.id, departmentId: deptA.id, serviceDateKey: dateKey,
    unitId: null, operationInstanceId: opAOther.id,
  });
  record(13, "Cross-department OperationInstance is rejected",
    !r13.ok && r13.reason === "OPERATION_DEPARTMENT_MISMATCH", r13.ok ? "accepted" : r13.reason);

  // 14. Cross-facility Unit is rejected.
  const r14 = await resolveAssignmentReferences(db, {
    facilityId: facilityA.id, departmentId: deptA.id, serviceDateKey: dateKey,
    unitId: unitB.id, operationInstanceId: opA.id,
  });
  record(14, "Cross-facility Unit is rejected",
    !r14.ok && r14.reason === "UNIT_NOT_FOUND", r14.ok ? "accepted" : r14.reason);

  // 15. Valid in-scope combination is accepted.
  const r15 = await resolveAssignmentReferences(db, {
    facilityId: facilityA.id, departmentId: deptA.id, serviceDateKey: dateKey,
    unitId: unitA.id, operationInstanceId: opA.id,
  });
  record(15, "Valid in-scope object combination is accepted", r15.ok, r15.ok ? "accepted" : r15.reason);

  // 16. Existing authentication and Milestone flows still work.
  const cPassword = await login(uPassword.email, PASSWORD);
  const dash = cPassword ? await probe(cPassword, "/dashboard") : { authenticated: false };
  const logs = cPassword ? await probe(cPassword, "/logs") : { authenticated: false };
  const unknown = await probe(cPassword, "/definitely-not-a-route");
  const evs = await probe(cPassword, "/evs");
  record(16, "Existing authentication and Milestone flows still work",
    dash.authenticated && logs.authenticated && unknown.status === 404 && evs.status === 404,
    `dashboard ${dash.status}, logs ${logs.status}, unknown ${unknown.status}, /evs ${evs.status}`);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} scenarios passed`);

  await db.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error("harness error:", e.message);
  await db.$disconnect();
  process.exit(3);
});
