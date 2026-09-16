import assert from "node:assert/strict";
import test from "node:test";

import { RoleKey } from "@prisma/client";

import {
  defaultAccessMethodForRole,
  isLeadershipRole,
  mayAuthenticateWithQuickPin,
  QUICK_PIN_ELIGIBLE_ROLES,
  requiresEmailPasswordAccount,
} from "@/lib/credential-policy";

test("defaultAccessMethodForRole uses email/password for Facility Admin, GM, Manager, and Supervisor", () => {
  assert.equal(defaultAccessMethodForRole(RoleKey.FACILITY_ADMINISTRATOR), "EMAIL_PASSWORD");
  assert.equal(defaultAccessMethodForRole(RoleKey.GM), "EMAIL_PASSWORD");
  assert.equal(defaultAccessMethodForRole(RoleKey.MANAGER), "EMAIL_PASSWORD");
  assert.equal(defaultAccessMethodForRole(RoleKey.SUPERVISOR), "EMAIL_PASSWORD");
});

test("defaultAccessMethodForRole defaults to PIN for other roles", () => {
  assert.equal(defaultAccessMethodForRole(RoleKey.LEAD_TEAM_MEMBER), "PIN_ONLY");
  assert.equal(defaultAccessMethodForRole(RoleKey.STAFF), "PIN_ONLY");
});

test("requiresEmailPasswordAccount identifies Facility Admin, GM, Manager, and Supervisor", () => {
  assert.equal(requiresEmailPasswordAccount(RoleKey.FACILITY_ADMINISTRATOR), true);
  assert.equal(requiresEmailPasswordAccount(RoleKey.GM), true);
  assert.equal(requiresEmailPasswordAccount(RoleKey.MANAGER), true);
  assert.equal(requiresEmailPasswordAccount(RoleKey.SUPERVISOR), true);
  assert.equal(requiresEmailPasswordAccount(RoleKey.LEAD_TEAM_MEMBER), false);
  assert.equal(requiresEmailPasswordAccount(RoleKey.STAFF), false);
});

test("isLeadershipRole identifies only manager and supervisor", () => {
  assert.equal(isLeadershipRole(RoleKey.MANAGER), true);
  assert.equal(isLeadershipRole(RoleKey.SUPERVISOR), true);
  assert.equal(isLeadershipRole(RoleKey.GM), false);
});

test("Quick PIN is allowed for every RoleKey including password-required roles", () => {
  for (const role of Object.values(RoleKey)) {
    assert.equal(mayAuthenticateWithQuickPin(role), true, `${role} must be PIN-eligible`);
  }
  assert.deepEqual([...QUICK_PIN_ELIGIBLE_ROLES].sort(), [...Object.values(RoleKey)].sort());
});

test("Quick PIN is denied for unknown or malformed role values", () => {
  assert.equal(mayAuthenticateWithQuickPin("ADMIN"), false);
  assert.equal(mayAuthenticateWithQuickPin("staff"), false);
  assert.equal(mayAuthenticateWithQuickPin(""), false);
  assert.equal(mayAuthenticateWithQuickPin(null), false);
  assert.equal(mayAuthenticateWithQuickPin(undefined), false);
  assert.equal(mayAuthenticateWithQuickPin(42), false);
  assert.equal(mayAuthenticateWithQuickPin({ role: RoleKey.STAFF }), false);
});

test("email/password requirement does not gate Quick PIN eligibility", () => {
  for (const role of Object.values(RoleKey)) {
    assert.equal(mayAuthenticateWithQuickPin(role), true);
    // Password-required roles remain password-required and PIN-eligible simultaneously.
    if (requiresEmailPasswordAccount(role)) {
      assert.equal(mayAuthenticateWithQuickPin(role), true);
    }
  }
});
