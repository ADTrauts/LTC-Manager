/**
 * Personal push authorization on logout and session replacement.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import { pushSendAuthorization } from "./push-authorization";
import {
  pushSubscriptionStatus,
  reconcilePushEndpoint,
  registerPushSubscription,
  releasePushEndpoint,
  revokeAuthenticatedUserPush,
  revokePushForDepartingUser,
} from "./push-subscription";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

const P256 = "B".repeat(40);
const AUTH = "C".repeat(22);

function tag() {
  return randomBytes(4).toString("hex");
}

function endpoint(suffix: string, name: string) {
  return `https://push.example.test/${suffix}/${name}`;
}

function lease(now: Date, version = 4) {
  return {
    authorizedSessionVersion: version,
    authorizedUntil: new Date(now.getTime() + 60 * 60 * 1000),
  };
}

test("logout revokes every personal subscription without an endpoint", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const now = new Date("2026-11-04T15:00:00.000Z");
  const ids: string[] = [];
  try {
    const alpha = await db.user.create({
      data: {
        email: `authz-alpha-${suffix}@example.test`,
        displayName: "Alpha",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
        sessionVersion: 4,
      },
    });
    const beta = await db.user.create({
      data: {
        email: `authz-beta-${suffix}@example.test`,
        displayName: "Beta",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    ids.push(alpha.id, beta.id);
    const desktop = endpoint(suffix, "desktop");
    const phone = endpoint(suffix, "phone");
    await registerPushSubscription(db, {
      userId: alpha.id,
      endpoint: desktop,
      p256dh: P256,
      auth: AUTH,
      now,
      ...lease(now, 4),
    });
    await registerPushSubscription(db, {
      userId: alpha.id,
      endpoint: phone,
      p256dh: P256,
      auth: AUTH,
      now,
      ...lease(now, 4),
    });
    await registerPushSubscription(db, {
      userId: beta.id,
      endpoint: endpoint(suffix, "beta"),
      p256dh: P256,
      auth: AUTH,
      now,
      ...lease(now, 1),
    });

    const loggedOut = await revokeAuthenticatedUserPush(db, { authKind: "user", uid: alpha.id }, now);
    assert.equal(loggedOut, "revoked");
    assert.equal(await db.pushSubscription.count({ where: { userId: alpha.id, revokedAt: null } }), 0);
    assert.equal(await db.pushSubscription.count({ where: { userId: beta.id, revokedAt: null } }), 1);
    assert.equal(await db.user.findUniqueOrThrow({ where: { id: alpha.id } }).then((row) => row.sessionVersion), 4);

    await registerPushSubscription(db, {
      userId: alpha.id,
      endpoint: desktop,
      p256dh: P256,
      auth: AUTH,
      now,
      ...lease(now, 4),
    });
    assert.equal(await db.pushSubscription.count({ where: { userId: alpha.id, endpoint: phone, revokedAt: null } }), 0);
    assert.equal(await db.pushSubscription.count({ where: { userId: alpha.id, endpoint: desktop, revokedAt: null } }), 1);

    const sameUser = await db.pushSubscription.count({ where: { userId: beta.id, revokedAt: null } });
    await revokePushForDepartingUser(db, { authKind: "user", uid: beta.id }, beta.id, now);
    assert.equal(await db.pushSubscription.count({ where: { userId: beta.id, revokedAt: null } }), sameUser);

    await revokePushForDepartingUser(db, { authKind: "user", uid: alpha.id }, beta.id, now);
    assert.equal(await db.pushSubscription.count({ where: { userId: alpha.id, revokedAt: null } }), 0);
    await registerPushSubscription(db, {
      userId: alpha.id,
      endpoint: desktop,
      p256dh: P256,
      auth: AUTH,
      now,
      ...lease(now),
    });
    await revokePushForDepartingUser(db, { authKind: "user", uid: alpha.id }, null, now);
    assert.equal(await db.pushSubscription.count({ where: { userId: alpha.id, revokedAt: null } }), 0);

    const skipped = await revokeAuthenticatedUserPush(db, { authKind: "employee", uid: alpha.id }, now);
    assert.equal(skipped, "skipped");
    const untouched = await releasePushEndpoint(db, { userId: beta.id, endpoint: desktop, now });
    assert.equal(untouched.released, 0);
  } finally {
    if (ids.length > 0) {
      await db.pushSubscription.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    await db.$disconnect();
  }
});

test("a historical subscription without a lease stays ineligible", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const now = new Date("2026-11-04T16:00:00.000Z");
  const ids: string[] = [];
  try {
    const user = await db.user.create({
      data: {
        email: `authz-old-${suffix}@example.test`,
        displayName: "Old",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    ids.push(user.id);
    const address = endpoint(suffix, "old");
    await db.pushSubscription.create({
      data: { userId: user.id, endpoint: address, p256dh: P256, auth: AUTH },
    });
    const row = await db.pushSubscription.findFirstOrThrow({ where: { endpoint: address } });
    assert.equal(row.authorizedUntil, null);
    assert.equal(
      pushSendAuthorization({
        revokedAt: row.revokedAt,
        authorizedUntil: row.authorizedUntil,
        userActive: true,
        now,
      }),
      "unbound",
    );
    assert.deepEqual(await pushSubscriptionStatus(db, { userId: user.id, endpoint: address, now }), {
      state: "not_enabled",
    });
    const kept = await reconcilePushEndpoint(db, {
      endpoint: address,
      userId: user.id,
      now,
      sessionExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      authorizedSessionVersion: 1,
    });
    assert.deepEqual(kept, { keep: false });
    const after = await db.pushSubscription.findFirstOrThrow({ where: { endpoint: address, revokedAt: null } });
    assert.equal(after.authorizedUntil, null);
    assert.equal(after.revokedAt, null);
  } finally {
    if (ids.length > 0) {
      await db.pushSubscription.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    await db.$disconnect();
  }
});
