/**
 * Personal push subscriptions.
 * Opt in via VERIFY_DATABASE_URL (a disposable migrated database).
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import { assertDisposableDatabaseUrl } from "@/lib/verify/database-target";

import {
  disablePushSubscription,
  pushSubscriptionStatus,
  PushSubscriptionError,
  reconcilePushEndpoint,
  registerPushSubscription,
  releasePushEndpoint,
  revokeAllPushSubscriptionsForUser,
} from "./push-subscription";

const databaseUrl = process.env.VERIFY_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseUrl(databaseUrl);
const skip = databaseUrl ? false : "set VERIFY_DATABASE_URL to a disposable migrated database to run these";

const P256 = "B".repeat(40);
const AUTH = "C".repeat(22);
const P256_NEXT = "D".repeat(40);

function tag() {
  return randomBytes(4).toString("hex");
}

function endpoint(suffix: string, name: string) {
  return `https://push.example.test/${suffix}/${name}`;
}

function lease(now: Date) {
  return {
    authorizedSessionVersion: 2,
    authorizedUntil: new Date(now.getTime() + 60 * 60 * 1000),
  };
}

test("a personal endpoint is owned by one User and can be revoked", { skip }, async () => {
  assert.ok(databaseUrl);
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = tag();
  const ids: string[] = [];
  const firstSeen = new Date("2026-11-03T15:00:00.000Z");
  const secondSeen = new Date("2026-11-03T15:05:00.000Z");
  const thirdSeen = new Date("2026-11-03T15:10:00.000Z");
  try {
    const alpha = await db.user.create({
      data: {
        email: `push-alpha-${suffix}@example.test`,
        displayName: "Alpha",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const beta = await db.user.create({
      data: {
        email: `push-beta-${suffix}@example.test`,
        displayName: "Beta",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    ids.push(alpha.id, beta.id);

    const shared = endpoint(suffix, "shared");
    const created = await registerPushSubscription(db, {
      userId: alpha.id,
      endpoint: shared,
      p256dh: P256,
      auth: AUTH,
      now: firstSeen,
      ...lease(firstSeen),
    });
    assert.deepEqual(created, { state: "enabled" });

    const again = await registerPushSubscription(db, {
      userId: alpha.id,
      endpoint: shared,
      p256dh: P256_NEXT,
      auth: AUTH,
      now: secondSeen,
      ...lease(secondSeen),
    });
    assert.deepEqual(again, { state: "enabled" });
    const alphaRows = await db.pushSubscription.findMany({ where: { endpoint: shared, userId: alpha.id } });
    assert.equal(alphaRows.length, 1);
    assert.equal(alphaRows[0]?.p256dh, P256_NEXT);
    assert.equal(alphaRows[0]?.lastSeenAt.toISOString(), secondSeen.toISOString());
    assert.equal(alphaRows[0]?.revokedAt, null);

    await registerPushSubscription(db, {
      userId: alpha.id,
      endpoint: endpoint(suffix, "phone"),
      p256dh: P256,
      auth: AUTH,
      now: secondSeen,
      ...lease(secondSeen),
    });
    await registerPushSubscription(db, {
      userId: alpha.id,
      endpoint: endpoint(suffix, "laptop"),
      p256dh: P256,
      auth: AUTH,
      now: secondSeen,
      ...lease(secondSeen),
    });
    const alphaActive = await db.pushSubscription.count({ where: { userId: alpha.id, revokedAt: null } });
    assert.equal(alphaActive, 3);

    const taken = await registerPushSubscription(db, {
      userId: beta.id,
      endpoint: shared,
      p256dh: P256,
      auth: AUTH,
      now: thirdSeen,
      ...lease(thirdSeen),
    });
    assert.deepEqual(taken, { state: "enabled" });
    const activeShared = await db.pushSubscription.findMany({ where: { endpoint: shared, revokedAt: null } });
    assert.equal(activeShared.length, 1);
    assert.equal(activeShared[0]?.userId, beta.id);
    const replaced = await db.pushSubscription.findFirst({ where: { endpoint: shared, userId: alpha.id } });
    assert.equal(replaced?.revokedReason, "REPLACED");
    assert.ok(replaced?.revokedAt);

    const status = await pushSubscriptionStatus(db, { userId: beta.id, endpoint: shared, now: thirdSeen });
    assert.deepEqual(status, { state: "enabled" });
    const hidden = await pushSubscriptionStatus(db, { userId: alpha.id, endpoint: shared, now: thirdSeen });
    assert.deepEqual(hidden, { state: "not_enabled" });

    const disabled = await disablePushSubscription(db, { userId: beta.id, endpoint: shared, now: thirdSeen });
    assert.deepEqual(disabled, { state: "not_enabled", serverRevoked: true });
    const disabledRow = await db.pushSubscription.findFirst({ where: { endpoint: shared, userId: beta.id } });
    assert.equal(disabledRow?.revokedReason, "USER_DISABLED");

    await registerPushSubscription(db, {
      userId: beta.id,
      endpoint: shared,
      p256dh: P256,
      auth: AUTH,
      now: thirdSeen,
      ...lease(thirdSeen),
    });
    const restored = await db.pushSubscription.findFirst({
      where: { endpoint: shared, userId: beta.id, revokedAt: null },
    });
    assert.ok(restored);
    const stillOne = await db.pushSubscription.count({ where: { endpoint: shared, revokedAt: null } });
    assert.equal(stillOne, 1);

    const foreign = await releasePushEndpoint(db, { userId: alpha.id, endpoint: shared, now: thirdSeen });
    assert.equal(foreign.released, 0);
    assert.equal(await db.pushSubscription.count({ where: { endpoint: shared, revokedAt: null } }), 1);
    await releasePushEndpoint(db, { userId: beta.id, endpoint: shared, now: thirdSeen });
    const afterLogout = await db.pushSubscription.findFirst({ where: { endpoint: shared, userId: beta.id } });
    assert.equal(afterLogout?.revokedReason, "LOGOUT");
    assert.equal(await db.pushSubscription.count({ where: { endpoint: shared, revokedAt: null } }), 0);

    await registerPushSubscription(db, {
      userId: alpha.id,
      endpoint: shared,
      p256dh: P256,
      auth: AUTH,
      now: thirdSeen,
      ...lease(thirdSeen),
    });
    const pin = await reconcilePushEndpoint(db, { endpoint: shared, userId: null, now: thirdSeen });
    assert.deepEqual(pin, { keep: false });
    assert.equal(await db.pushSubscription.count({ where: { endpoint: shared, revokedAt: null } }), 1);

    await registerPushSubscription(db, {
      userId: alpha.id,
      endpoint: shared,
      p256dh: P256,
      auth: AUTH,
      now: thirdSeen,
      ...lease(thirdSeen),
    });
    const kept = await reconcilePushEndpoint(db, { endpoint: shared, userId: alpha.id, now: thirdSeen });
    assert.deepEqual(kept, { keep: true });
    const switched = await reconcilePushEndpoint(db, { endpoint: shared, userId: beta.id, now: thirdSeen });
    assert.deepEqual(switched, { keep: false });
    const afterSwitch = await db.pushSubscription.findFirst({ where: { endpoint: shared, revokedAt: null } });
    assert.equal(afterSwitch, null);
    const alphaReleased = await db.pushSubscription.findFirst({
      where: { endpoint: shared, userId: alpha.id, revokedReason: "LOGOUT" },
    });
    assert.ok(alphaReleased);

    await registerPushSubscription(db, {
      userId: alpha.id,
      endpoint: endpoint(suffix, "desktop"),
      p256dh: P256,
      auth: AUTH,
      now: thirdSeen,
      ...lease(thirdSeen),
    });
    await revokeAllPushSubscriptionsForUser(db, { userId: alpha.id, now: thirdSeen });
    assert.equal(await db.pushSubscription.count({ where: { userId: alpha.id, revokedAt: null } }), 0);

    await assert.rejects(
      () =>
        registerPushSubscription(db, {
          userId: `missing-${suffix}`,
          endpoint: endpoint(suffix, "missing"),
          p256dh: P256,
          auth: AUTH,
          now: thirdSeen,
          ...lease(thirdSeen),
        }),
      (error: unknown) => error instanceof PushSubscriptionError && error.code === "DENIED",
    );
  } finally {
    if (ids.length > 0) {
      await db.pushSubscription.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    await db.$disconnect();
  }
});
