import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import bcrypt from "bcryptjs";

import { changeOwnUserPassword } from "./change-own-password";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("changeOwnUserPassword updates the User by id and increments sessionVersion", async () => {
  const currentHash = await bcrypt.hash("old-password-1", 4);
  const user = {
    id: "user-1",
    isActive: true,
    passwordHash: currentHash,
    sessionVersion: 2,
    facilityId: "should-not-be-queried",
  };

  const client = {
    user: {
      findFirst: async ({ where }: { where: { id: string; isActive: boolean; facilityId?: string } }) => {
        assert.equal(where.id, "user-1");
        assert.equal(where.isActive, true);
        assert.equal("facilityId" in where, false);
        return user.isActive && user.id === where.id
          ? { id: user.id, passwordHash: user.passwordHash }
          : null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { passwordHash?: string; sessionVersion?: { increment: number } };
      }) => {
        assert.equal(where.id, "user-1");
        if (data.passwordHash) user.passwordHash = data.passwordHash;
        if (data.sessionVersion?.increment) {
          user.sessionVersion += data.sessionVersion.increment;
        }
        return user;
      },
    },
    $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client),
  };

  const result = await changeOwnUserPassword(client, {
    userId: "user-1",
    currentPassword: "old-password-1",
    newPassword: "new-password-2",
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(user.sessionVersion, 3);
  assert.equal(await bcrypt.compare("new-password-2", user.passwordHash), true);
  assert.equal(user.facilityId, "should-not-be-queried");
});

test("changeOwnUserPassword rejects a wrong current password without revoking sessions", async () => {
  const user = {
    id: "user-1",
    isActive: true,
    passwordHash: await bcrypt.hash("old-password-1", 4),
    sessionVersion: 4,
  };
  let updated = false;
  const client = {
    user: {
      findFirst: async () => ({ id: user.id, passwordHash: user.passwordHash }),
      update: async () => {
        updated = true;
        return user;
      },
    },
    $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client),
  };

  const result = await changeOwnUserPassword(client, {
    userId: "user-1",
    currentPassword: "wrong-password",
    newPassword: "new-password-2",
  });
  assert.deepEqual(result, { ok: false, message: "Current password is incorrect." });
  assert.equal(updated, false);
  assert.equal(user.sessionVersion, 4);
});

test("password action is User-gated and does not remint the current session", () => {
  const action = source("src/app/account/security/actions.ts");
  const helper = source("src/lib/account-security/change-own-password.ts");
  assert.match(action, /requireAuthenticatedUserSession/);
  assert.equal(action.includes("requireFacilitySession"), false);
  assert.equal(action.includes("facilityId"), false);
  assert.match(helper, /revokeUserSessions/);
  assert.equal(helper.includes("createAccountSessionToken"), false);
  assert.equal(helper.includes("enterContext"), false);
  assert.equal(helper.includes("employee"), false);
});
