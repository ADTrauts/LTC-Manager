import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createSessionToken, verifySessionToken } from "@/lib/auth";
import type { AppJwtPayload } from "@/lib/auth";

import { endSignedOutUserCredential, validateSessionAuthority, type PrismaLike } from "./session-version";

const LIVE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function user(jti?: string): AppJwtPayload {
  return {
    uid: "user-1",
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "account",
    name: "User",
    email: "user@example.test",
    sessionVersion: 0,
    jti,
  } as AppJwtPayload;
}

function memory(revoked: Map<string, string> = new Map()): PrismaLike & {
  versions: Map<string, number>;
  revoked: Map<string, string>;
} {
  const versions = new Map<string, number>([["user-1", 0]]);
  const db = {
    versions,
    revoked,
    user: {
      findUnique: async () => ({ isActive: true, sessionVersion: versions.get("user-1") ?? 0 }),
      update: async ({ data }: { data: { sessionVersion: { increment: number } } }) => {
        const next = (versions.get("user-1") ?? 0) + data.sessionVersion.increment;
        versions.set("user-1", next);
        return { sessionVersion: next };
      },
    },
    revokedUserSession: {
      findUnique: async ({ where }: { where: { jti: string } }) => {
        const userId = revoked.get(where.jti);
        return userId ? { userId } : null;
      },
      create: async ({ data }: { data: { jti: string; userId: string } }) => {
        if (revoked.has(data.jti)) {
          const error = new Error("unique") as Error & { code: string };
          error.code = "P2002";
          throw error;
        }
        revoked.set(data.jti, data.userId);
        return data;
      },
    },
  };
  return db as unknown as PrismaLike & { versions: Map<string, number>; revoked: Map<string, string> };
}

test("a User credential without jti still validates identity; denylist lookup needs a jti", async () => {
  const db = memory();
  const missing = await validateSessionAuthority(user(), db);
  assert.equal(missing.valid, true);

  const employee = await validateSessionAuthority(
    {
      uid: "employee-1",
      authKind: "employee",
      authMethod: "QUICK_PIN",
      scopeKind: "facility",
      role: "STAFF",
      name: "Pin",
      email: "",
      facilityId: "facility-1",
      sessionVersion: 4,
    } as AppJwtPayload,
    {
      employee: {
        findUnique: async () => ({
          status: "ACTIVE",
          sessionVersion: 4,
          facilityId: "facility-1",
          roleType: "STAFF",
          primaryDepartmentId: null,
          employeeDepartments: [],
        }),
      },
    } as unknown as PrismaLike,
  );
  assert.equal(employee.valid, true);
});

test("signing out one User credential leaves the other credential valid", async () => {
  const db = memory();
  const signedOut = user(LIVE);
  const kept = user(OTHER);
  assert.equal((await validateSessionAuthority(signedOut, db)).valid, true);
  assert.equal((await validateSessionAuthority(kept, db)).valid, true);

  const ended = await endSignedOutUserCredential(db, {
    userId: "user-1",
    jti: LIVE,
    expiresAt: new Date("2026-11-06T00:00:00.000Z"),
  });
  assert.equal(ended, "session");
  assert.equal(db.versions.get("user-1"), 0);
  const again = await endSignedOutUserCredential(db, {
    userId: "user-1",
    jti: LIVE,
    expiresAt: new Date("2026-11-06T00:00:00.000Z"),
  });
  assert.equal(again, "session");

  const replay = await validateSessionAuthority(signedOut, db);
  assert.equal(replay.valid, false);
  assert.equal(replay.valid === false && replay.reason, "SESSION_REVOKED");
  assert.equal((await validateSessionAuthority(kept, db)).valid, true);
});

test("signing out a legacy User credential increments the User version", async () => {
  const db = memory();
  const ended = await endSignedOutUserCredential(db, {
    userId: "user-1",
    jti: null,
    expiresAt: new Date("2026-11-06T00:00:00.000Z"),
  });
  assert.equal(ended, "legacy_version");
  assert.equal(db.versions.get("user-1"), 1);
  const stale = await validateSessionAuthority(user(LIVE), db);
  assert.equal(stale.valid, false);
  assert.equal(stale.valid === false && stale.reason, "VERSION_STALE");
});

test("new User tokens carry jti and employee tokens do not", async () => {
  process.env.AUTH_SECRET ??= "revoked-user-session-hermetic-secret";
  const userToken = await createSessionToken({
    uid: "user-1",
    authKind: "user",
    role: "MANAGER",
    name: "User",
    email: "user@example.test",
    facilityId: "facility-1",
    sessionVersion: 0,
  });
  const pinToken = await createSessionToken({
    uid: "employee-1",
    authKind: "employee",
    authMethod: "QUICK_PIN",
    role: "STAFF",
    name: "Pin",
    email: "",
    facilityId: "facility-1",
    sessionVersion: 0,
  });
  const userSession = await verifySessionToken(userToken);
  const pinSession = await verifySessionToken(pinToken);
  assert.match(userSession.jti ?? "", /^[0-9a-f-]{36}$/i);
  assert.equal(pinSession.jti, undefined);
});

test("ordinary logout revokes the presented User credential and still clears only after success", () => {
  const logout = readFileSync("src/app/api/auth/logout/route.ts", "utf8");
  assert.match(logout, /revokeAuthenticatedUserPush/);
  assert.match(logout, /endSignedOutUserCredential/);
  assert.match(logout, /userSessionKey/);
  assert.match(logout, /logoutClearsSession\(outcome\)/);
  assert.match(logout, /status: 503/);
  assert.doesNotMatch(logout, /console\.(log|info|debug|error|warn)/);
  const kept = logout.slice(logout.indexOf("if (!logoutClearsSession"));
  assert.ok(kept.indexOf('outcome: "anonymous"') < kept.indexOf("clearSessionCookies"));
  const security = readFileSync("src/app/account/security/actions.ts", "utf8");
  assert.match(security, /revokeOwnSessions/);
  assert.doesNotMatch(security, /endSignedOutUserCredential/);
});
