import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { NON_REVOKING_CHANGES } from "@/lib/session-revocation";

import { normalizeDisplayName, updateOwnDisplayName } from "./update-own-display-name";

test("normalizeDisplayName trims and accepts a one-character or Unicode name", () => {
  assert.deepEqual(normalizeDisplayName(""), { ok: false, message: "Enter a display name." });
  assert.deepEqual(normalizeDisplayName("   "), { ok: false, message: "Enter a display name." });
  assert.deepEqual(normalizeDisplayName("A"), { ok: true, value: "A" });
  assert.deepEqual(normalizeDisplayName("  Andrew Trautman  "), { ok: true, value: "Andrew Trautman" });
  assert.deepEqual(normalizeDisplayName("安"), { ok: true, value: "安" });
  assert.deepEqual(normalizeDisplayName("José María"), { ok: true, value: "José María" });
  assert.equal(normalizeDisplayName("x".repeat(121)).ok, false);
  assert.deepEqual(normalizeDisplayName("x".repeat(120)), { ok: true, value: "x".repeat(120) });
});

test("normalizeDisplayName does not title-case, lowercase, or split names", () => {
  assert.deepEqual(normalizeDisplayName("andrew trautman"), { ok: true, value: "andrew trautman" });
  assert.deepEqual(normalizeDisplayName("ANDREW"), { ok: true, value: "ANDREW" });
});

test("updateOwnDisplayName writes User.displayName only and leaves sessionVersion unchanged", async () => {
  const user = {
    id: "user-1",
    isActive: true,
    displayName: "Old Name",
    sessionVersion: 7,
    email: "old@example.com",
  };
  const employee = { firstName: "Old", lastName: "Employee", email: "hr@example.com" };
  const hrLogs: unknown[] = [];

  const client = {
    user: {
      findFirst: async ({ where }: { where: { id: string; isActive: boolean; facilityId?: string } }) => {
        assert.equal(where.id, "user-1");
        assert.equal(where.isActive, true);
        assert.equal("facilityId" in where, false);
        return { id: user.id, sessionVersion: user.sessionVersion };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { displayName?: string; sessionVersion?: { increment: number }; email?: string };
      }) => {
        assert.equal(where.id, "user-1");
        assert.equal(data.email, undefined);
        assert.equal(data.sessionVersion, undefined);
        if (data.displayName) user.displayName = data.displayName;
        return { displayName: user.displayName, sessionVersion: user.sessionVersion };
      },
    },
    employee: {
      updateMany: async () => {
        throw new Error("Employee must not be updated");
      },
    },
    employeeHrAuditLog: {
      create: async (row: unknown) => {
        hrLogs.push(row);
      },
    },
  };

  const result = await updateOwnDisplayName(client, {
    userId: "user-1",
    displayName: "  New Name  ",
  });
  assert.deepEqual(result, { ok: true, displayName: "New Name", sessionVersion: 7 });
  assert.equal(user.displayName, "New Name");
  assert.equal(user.sessionVersion, 7);
  assert.equal(user.email, "old@example.com");
  assert.deepEqual(employee, { firstName: "Old", lastName: "Employee", email: "hr@example.com" });
  assert.deepEqual(hrLogs, []);
});

test("displayName remains a non-revoking User change", () => {
  assert.equal((NON_REVOKING_CHANGES as readonly string[]).includes("displayName"), true);
});

test("profile action mutates only displayName and remints the current session", () => {
  const action = readFileSync(join(process.cwd(), "src/app/account/actions.ts"), "utf8");
  assert.match(action, /readAuthenticatedUserIdentity/);
  assert.match(action, /updateOwnDisplayName/);
  assert.match(action, /remintCurrentUserSession/);
  assert.match(action, /applyRemintedUserSessionCookies/);
  assert.match(action, /formData.has\("email"\)/);
  assert.match(action, /formData.has\("employeeId"\)/);
  assert.match(action, /\.strict\(\)/);
  assert.equal(action.includes("formData.get(\"email\")"), false);
  assert.equal(action.includes("requireFacilitySession"), false);
  assert.equal(action.includes("listAvailableContexts"), false);
  assert.equal(action.includes("Employee"), false);
  assert.equal(action.includes("employee-identity"), false);
  assert.equal(action.includes("revokeUserSessions"), false);
});
