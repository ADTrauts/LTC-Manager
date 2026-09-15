import assert from "node:assert/strict";
import test from "node:test";

import { RoleKey } from "@prisma/client";

import {
  pinInvalidationAuditValues,
  roleChangeInvalidatesPin,
} from "@/lib/employee-pin-invalidation";

const EXISTING_PIN = "a".repeat(64);

test("promotion from STAFF to SUPERVISOR preserves PIN (email and PIN are independent)", () => {
  assert.equal(
    roleChangeInvalidatesPin({
      nextRoleType: RoleKey.SUPERVISOR,
      currentPinDigest: EXISTING_PIN,
    }),
    false,
  );
});

test("promotion into any password-required role preserves an existing PIN", () => {
  for (const role of [
    RoleKey.SUPERVISOR,
    RoleKey.MANAGER,
    RoleKey.GM,
    RoleKey.FACILITY_ADMINISTRATOR,
  ]) {
    assert.equal(
      roleChangeInvalidatesPin({ nextRoleType: role, currentPinDigest: EXISTING_PIN }),
      false,
      `${role} must retain Quick PIN alongside email/password`,
    );
  }
});

test("role change with no PIN is a no-op", () => {
  assert.equal(
    roleChangeInvalidatesPin({ nextRoleType: RoleKey.GM, currentPinDigest: null }),
    false,
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
});

test("audit values never include the digest", () => {
  const audit = pinInvalidationAuditValues(RoleKey.SUPERVISOR);
  assert.equal(audit.fieldKey, "employee.pinDigest");
  assert.equal(audit.oldValue, "set");
  assert.match(audit.newValue, /unset/);
  const serialized = JSON.stringify(audit);
  assert.ok(!serialized.includes(EXISTING_PIN), "audit must never carry the digest");
});
