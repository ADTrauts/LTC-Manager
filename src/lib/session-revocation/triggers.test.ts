import assert from "node:assert/strict";
import test from "node:test";

import {
  describeRevocation,
  employeeRevocationReasons,
  userRevocationReasons,
  type EmployeeAuthoritySnapshot,
  type RevocationReason,
  type UserAuthoritySnapshot,
} from "./triggers";

const baseEmployee: EmployeeAuthoritySnapshot = {
  roleType: "STAFF",
  status: "ACTIVE",
  hasPin: true,
};

function employee(overrides: Partial<EmployeeAuthoritySnapshot>): EmployeeAuthoritySnapshot {
  return { ...baseEmployee, ...overrides };
}

test("an unchanged employee record revokes nothing", () => {
  assert.deepEqual(employeeRevocationReasons(baseEmployee, employee({})), []);
});

test("a role change revokes, because the session carries the old role", () => {
  assert.deepEqual(employeeRevocationReasons(baseEmployee, employee({ roleType: "SUPERVISOR" })), [
    "ROLE_CHANGED",
  ]);
});

test("a role change revokes when authority decreases as well as increases", () => {
  const before = employee({ roleType: "SUPERVISOR" });
  assert.deepEqual(employeeRevocationReasons(before, employee({ roleType: "STAFF" })), [
    "ROLE_CHANGED",
  ]);
});

test("termination revokes", () => {
  assert.deepEqual(employeeRevocationReasons(baseEmployee, employee({ status: "TERMINATED" })), [
    "EMPLOYEE_TERMINATED",
  ]);
});

test("an already-terminated employee edited again does not re-revoke", () => {
  const before = employee({ status: "TERMINATED" });
  assert.deepEqual(employeeRevocationReasons(before, employee({ status: "TERMINATED" })), []);
});

test("EmployeeStatus.OFF does not revoke, because it means off shift and not deactivated", () => {
  assert.deepEqual(employeeRevocationReasons(baseEmployee, employee({ status: "OFF" })), []);
});

test("returning from OFF to ACTIVE does not revoke", () => {
  const before = employee({ status: "OFF" });
  assert.deepEqual(employeeRevocationReasons(before, employee({ status: "ACTIVE" })), []);
});

test("removing a PIN revokes the sessions it established", () => {
  assert.deepEqual(employeeRevocationReasons(baseEmployee, employee({ hasPin: false })), [
    "PIN_REMOVED",
  ]);
});

test("issuing a first PIN does not revoke, because no PIN session existed", () => {
  const before = employee({ hasPin: false });
  assert.deepEqual(employeeRevocationReasons(before, employee({ hasPin: true })), []);
});

test("one edit that changes several things reports every reason", () => {
  const reasons = employeeRevocationReasons(
    baseEmployee,
    employee({ roleType: "GM", status: "TERMINATED", hasPin: false }),
  );
  assert.deepEqual(reasons.sort(), ["EMPLOYEE_TERMINATED", "PIN_REMOVED", "ROLE_CHANGED"]);
});

const baseUser: UserAuthoritySnapshot = { roleId: "role-staff", isActive: true };

test("an unchanged user record revokes nothing", () => {
  assert.deepEqual(userRevocationReasons(baseUser, { ...baseUser }), []);
});

test("a user role change revokes", () => {
  assert.deepEqual(userRevocationReasons(baseUser, { ...baseUser, roleId: "role-gm" }), [
    "ROLE_CHANGED",
  ]);
});

test("deactivating a user revokes", () => {
  assert.deepEqual(userRevocationReasons(baseUser, { ...baseUser, isActive: false }), [
    "USER_DEACTIVATED",
  ]);
});

test("reactivating a user does not revoke", () => {
  const before = { ...baseUser, isActive: false };
  assert.deepEqual(userRevocationReasons(before, { ...baseUser, isActive: true }), []);
});

test("every reason has audit text that names no credential", () => {
  const reasons: RevocationReason[] = [
    "PASSWORD_CHANGED",
    "PIN_CHANGED",
    "PIN_REMOVED",
    "ROLE_CHANGED",
    "EMPLOYEE_TERMINATED",
    "USER_DEACTIVATED",
    "FACILITY_ACCESS_REVOKED",
    "DEPARTMENT_MEMBERSHIP_REMOVED",
    "EXPLICIT_REVOKE",
  ];
  for (const reason of reasons) {
    const text = describeRevocation(reason);
    assert.ok(text.length > 0, `${reason} has no audit text`);
    assert.doesNotMatch(text, /\d{4,}/, `${reason} audit text looks like it contains a secret`);
    assert.doesNotMatch(text, /token|cookie|digest|hash/i, `${reason} audit text names a credential`);
  }
});
