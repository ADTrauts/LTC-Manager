import assert from "node:assert/strict";
import test from "node:test";

import { RoleKey } from "@prisma/client";

import {
  pinInvalidationAuditValues,
  roleChangeInvalidatesPin,
} from "@/lib/employee-pin-invalidation";

const EXISTING_PIN = "a".repeat(64);

test("promotion from STAFF to SUPERVISOR clears the PIN", () => {
  assert.equal(
    roleChangeInvalidatesPin({
      nextRoleType: RoleKey.SUPERVISOR,
      currentPinDigest: EXISTING_PIN,
    }),
    true,
  );
});

test("promotion from LEAD_TEAM_MEMBER to MANAGER clears the PIN", () => {
  assert.equal(
    roleChangeInvalidatesPin({
      nextRoleType: RoleKey.MANAGER,
      currentPinDigest: EXISTING_PIN,
    }),
    true,
  );
});

test("promotion into any password-required role clears an existing PIN", () => {
  for (const role of [
    RoleKey.SUPERVISOR,
    RoleKey.MANAGER,
    RoleKey.GM,
    RoleKey.FACILITY_ADMINISTRATOR,
  ]) {
    assert.equal(
      roleChangeInvalidatesPin({ nextRoleType: role, currentPinDigest: EXISTING_PIN }),
      true,
      `${role} must not retain a Quick PIN`,
    );
  }
});

test("SUPERVISOR to GM is a no-op when no PIN exists", () => {
  assert.equal(
    roleChangeInvalidatesPin({ nextRoleType: RoleKey.GM, currentPinDigest: null }),
    false,
  );
});

test("legacy PIN on a password-required role is still cleared on any further role change", () => {
  // Guards rows that predate enforcement: a SUPERVISOR that somehow holds a digest must lose it
  // the next time the role is written, not keep it because the role was already password-required.
  assert.equal(
    roleChangeInvalidatesPin({ nextRoleType: RoleKey.GM, currentPinDigest: EXISTING_PIN }),
    true,
  );
});

test("demotion from MANAGER to STAFF does not create a PIN", () => {
  assert.equal(
    roleChangeInvalidatesPin({ nextRoleType: RoleKey.STAFF, currentPinDigest: null }),
    false,
  );
});

test("STAFF to LEAD_TEAM_MEMBER preserves an eligible PIN", () => {
  assert.equal(
    roleChangeInvalidatesPin({
      nextRoleType: RoleKey.LEAD_TEAM_MEMBER,
      currentPinDigest: EXISTING_PIN,
    }),
    false,
  );
  assert.equal(
    roleChangeInvalidatesPin({ nextRoleType: RoleKey.STAFF, currentPinDigest: EXISTING_PIN }),
    false,
  );
});

test("audit values record the eligibility change without the PIN or its digest", () => {
  const audit = pinInvalidationAuditValues(RoleKey.SUPERVISOR);
  assert.equal(audit.fieldKey, "employee.pinDigest");
  assert.equal(audit.oldValue, "set");
  assert.match(audit.newValue, /unset/);
  assert.match(audit.newValue, /SUPERVISOR/);
  const serialized = JSON.stringify(audit);
  assert.ok(!serialized.includes(EXISTING_PIN), "audit must never carry the digest");
});
