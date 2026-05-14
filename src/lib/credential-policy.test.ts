import assert from "node:assert/strict";
import test from "node:test";

import { RoleKey } from "@prisma/client";

import {
  defaultAccessMethodForRole,
  isLeadershipRole,
  requiresEmailPasswordAccount,
} from "@/lib/credential-policy";

test("defaultAccessMethodForRole uses email/password for GM, Manager, and Supervisor", () => {
  assert.equal(defaultAccessMethodForRole(RoleKey.GM), "EMAIL_PASSWORD");
  assert.equal(defaultAccessMethodForRole(RoleKey.MANAGER), "EMAIL_PASSWORD");
  assert.equal(defaultAccessMethodForRole(RoleKey.SUPERVISOR), "EMAIL_PASSWORD");
});

test("defaultAccessMethodForRole defaults to PIN for other roles", () => {
  assert.equal(defaultAccessMethodForRole(RoleKey.LEAD_TEAM_MEMBER), "PIN_ONLY");
  assert.equal(defaultAccessMethodForRole(RoleKey.STAFF), "PIN_ONLY");
});

test("requiresEmailPasswordAccount identifies GM, Manager, and Supervisor", () => {
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
