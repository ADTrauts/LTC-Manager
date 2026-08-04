/**
 * Exercises the real SQL behind the durable limiter, so it needs a throwaway Postgres database.
 *
 * Set AUTH_RATE_LIMIT_TEST_DATABASE_URL to a database that has had `prisma migrate deploy`
 * applied. Without it the suite skips, which keeps `npm test` hermetic on a fresh clone. Never
 * point this at a database holding real data: the suite deletes rows from AuthRateLimitBucket.
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";

const TEST_DATABASE_URL = process.env.AUTH_RATE_LIMIT_TEST_DATABASE_URL;
const skip = TEST_DATABASE_URL
  ? false
  : "set AUTH_RATE_LIMIT_TEST_DATABASE_URL to a disposable migrated database to run these";

process.env.AUTH_SECRET ??= "auth-rate-limit-db-test-secret";

type Suite = {
  db: import("@prisma/client").PrismaClient;
  lib: typeof import("@/lib/auth-rate-limit");
  BucketType: typeof import("@prisma/client").AuthRateLimitBucketType;
};

let suite: Suite | null = null;

async function getSuite(): Promise<Suite> {
  if (suite) return suite;
  const { PrismaClient, AuthRateLimitBucketType } = await import("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  const lib = await import("@/lib/auth-rate-limit");
  suite = { db, lib, BucketType: AuthRateLimitBucketType };
  return suite;
}

/** Unique per test so cases cannot interfere through a shared bucket. */
function uniqueKey(label: string): string {
  return `test_${label}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

test("failed attempts increment and eventually lock", { skip }, async () => {
  const { db, lib, BucketType } = await getSuite();
  const key = uniqueKey("increments");
  const bucket = {
    key,
    type: BucketType.PASSWORD_ACCOUNT,
    policyOverrides: { threshold: 3, windowMs: 60_000, lockMs: 60_000 },
  };

  for (let i = 0; i < 2; i++) {
    await lib.registerAuthFailure([bucket], { db });
    assert.equal((await lib.checkAuthRateLimit([bucket], { db })).locked, false);
  }

  const row = await db.authRateLimitBucket.findUnique({ where: { bucketKey: key } });
  assert.equal(row?.attemptCount, 2);
  assert.equal(row?.lockedUntil, null);

  await lib.registerAuthFailure([bucket], { db });
  const decision = await lib.checkAuthRateLimit([bucket], { db });
  assert.equal(decision.locked, true);
  if (decision.locked) {
    assert.ok(decision.retryAfterSec > 0);
    assert.equal(decision.bucketType, BucketType.PASSWORD_ACCOUNT);
  }

  await db.authRateLimitBucket.delete({ where: { bucketKey: key } });
});

test("stored instants are UTC, so Retry-After does not skew with the host timezone", { skip }, async () => {
  const { db, lib, BucketType } = await getSuite();
  const key = uniqueKey("utc");
  const lockMs = 15 * 60 * 1000;
  const bucket = {
    key,
    type: BucketType.PASSWORD_ACCOUNT,
    policyOverrides: { threshold: 1, windowMs: 60_000, lockMs },
  };

  const before = Date.now();
  await lib.registerAuthFailure([bucket], { db });
  const after = Date.now();

  const row = await db.authRateLimitBucket.findUnique({ where: { bucketKey: key } });
  assert.ok(row?.lockedUntil);
  const lockedUntilMs = row.lockedUntil.getTime();
  assert.ok(
    lockedUntilMs >= before + lockMs - 5_000 && lockedUntilMs <= after + lockMs + 5_000,
    `lockedUntil must land ~${lockMs}ms ahead of real time, not offset by the host UTC offset`,
  );

  const decision = await lib.checkAuthRateLimit([bucket], { db });
  assert.equal(decision.locked, true);
  if (decision.locked) {
    assert.ok(
      decision.retryAfterSec > lockMs / 1000 - 60,
      `retryAfterSec ${decision.retryAfterSec} should reflect the configured lock duration`,
    );
  }

  await db.authRateLimitBucket.delete({ where: { bucketKey: key } });
});

test("lock expires and access is restored", { skip }, async () => {
  const { db, lib, BucketType } = await getSuite();
  const key = uniqueKey("expiry");
  const bucket = {
    key,
    type: BucketType.PIN_CANDIDATE,
    policyOverrides: { threshold: 1, windowMs: 60_000, lockMs: 1_000 },
  };

  const lockedAt = new Date();
  await lib.registerAuthFailure([bucket], { db, now: lockedAt });
  assert.equal((await lib.checkAuthRateLimit([bucket], { db, now: lockedAt })).locked, true);

  const afterLock = new Date(lockedAt.getTime() + 2_000);
  assert.equal((await lib.checkAuthRateLimit([bucket], { db, now: afterLock })).locked, false);

  await db.authRateLimitBucket.delete({ where: { bucketKey: key } });
});

test("counting window restarts after it elapses", { skip }, async () => {
  const { db, lib, BucketType } = await getSuite();
  const key = uniqueKey("window");
  const bucket = {
    key,
    type: BucketType.PASSWORD_ACCOUNT,
    policyOverrides: { threshold: 3, windowMs: 10_000, lockMs: 60_000 },
  };

  const start = new Date();
  await lib.registerAuthFailure([bucket], { db, now: start });
  await lib.registerAuthFailure([bucket], { db, now: start });
  assert.equal((await db.authRateLimitBucket.findUnique({ where: { bucketKey: key } }))?.attemptCount, 2);

  // A failure after the window has elapsed restarts the count rather than tipping into a lock.
  const later = new Date(start.getTime() + 20_000);
  await lib.registerAuthFailure([bucket], { db, now: later });
  const row = await db.authRateLimitBucket.findUnique({ where: { bucketKey: key } });
  assert.equal(row?.attemptCount, 1);
  assert.equal(row?.lockedUntil, null);

  await db.authRateLimitBucket.delete({ where: { bucketKey: key } });
});

test("concurrent failures cannot lose increments or slip past the threshold", { skip }, async () => {
  const { db, lib, BucketType } = await getSuite();
  const key = uniqueKey("concurrent");
  const bucket = {
    key,
    type: BucketType.PIN_CANDIDATE,
    policyOverrides: { threshold: 5, windowMs: 60_000, lockMs: 60_000 },
  };

  const attempts = 20;
  await Promise.all(
    Array.from({ length: attempts }, () => lib.registerAuthFailure([bucket], { db })),
  );

  const row = await db.authRateLimitBucket.findUnique({ where: { bucketKey: key } });
  assert.equal(row?.attemptCount, attempts, "every concurrent increment must be recorded");
  assert.ok(row?.lockedUntil, "threshold must lock even when all attempts race");
  assert.equal((await lib.checkAuthRateLimit([bucket], { db })).locked, true);

  await db.authRateLimitBucket.delete({ where: { bucketKey: key } });
});

test("resetting one bucket leaves the broader bucket intact", { skip }, async () => {
  const { db, lib, BucketType } = await getSuite();
  const candidateKey = uniqueKey("candidate");
  const facilityKey = uniqueKey("facility");
  const candidate = {
    key: candidateKey,
    type: BucketType.PIN_CANDIDATE,
    policyOverrides: { threshold: 2, windowMs: 60_000, lockMs: 60_000 },
  };
  const facility = {
    key: facilityKey,
    type: BucketType.PIN_FACILITY,
    policyOverrides: { threshold: 50, windowMs: 60_000, lockMs: 60_000 },
  };

  await lib.registerAuthFailure([candidate, facility], { db });
  await lib.resetAuthRateLimitBucket(candidateKey, { db });

  assert.equal(await db.authRateLimitBucket.findUnique({ where: { bucketKey: candidateKey } }), null);
  const facilityRow = await db.authRateLimitBucket.findUnique({ where: { bucketKey: facilityKey } });
  assert.equal(facilityRow?.attemptCount, 1, "a success must not erase facility-wide evidence");

  await db.authRateLimitBucket.delete({ where: { bucketKey: facilityKey } });
});

test("candidate rotation still reaches the facility-wide backstop", { skip }, async () => {
  const { db, lib, BucketType } = await getSuite();
  const facilityKey = uniqueKey("rotation_facility");
  const facility = {
    key: facilityKey,
    type: BucketType.PIN_FACILITY,
    policyOverrides: { threshold: 6, windowMs: 60_000, lockMs: 60_000 },
  };
  const candidateKeys: string[] = [];

  // Each attempt uses a fresh candidate bucket, so no candidate bucket ever reaches its own
  // threshold. The facility bucket is what stops the sweep.
  for (let i = 0; i < 6; i++) {
    const candidateKey = uniqueKey(`rotation_candidate_${i}`);
    candidateKeys.push(candidateKey);
    await lib.registerAuthFailure(
      [
        {
          key: candidateKey,
          type: BucketType.PIN_CANDIDATE,
          policyOverrides: { threshold: 5, windowMs: 60_000, lockMs: 60_000 },
        },
        facility,
      ],
      { db },
    );
  }

  assert.equal((await lib.checkAuthRateLimit([facility], { db })).locked, true);
  for (const candidateKey of candidateKeys) {
    const row = await db.authRateLimitBucket.findUnique({ where: { bucketKey: candidateKey } });
    assert.equal(row?.lockedUntil, null, "no individual candidate reached its own threshold");
  }

  await db.authRateLimitBucket.deleteMany({
    where: { bucketKey: { in: [facilityKey, ...candidateKeys] } },
  });
});

test("one facility's failures do not lock another facility", { skip }, async () => {
  const { db, lib, BucketType } = await getSuite();
  const { pinFacilityBucketKey } = lib;
  const facilityA = pinFacilityBucketKey(uniqueKey("fac_a"));
  const facilityB = pinFacilityBucketKey(uniqueKey("fac_b"));
  const overrides = { threshold: 2, windowMs: 60_000, lockMs: 60_000 };

  const bucketA = { key: facilityA, type: BucketType.PIN_FACILITY, policyOverrides: overrides };
  const bucketB = { key: facilityB, type: BucketType.PIN_FACILITY, policyOverrides: overrides };

  await lib.registerAuthFailure([bucketA], { db });
  await lib.registerAuthFailure([bucketA], { db });

  assert.equal((await lib.checkAuthRateLimit([bucketA], { db })).locked, true);
  assert.equal((await lib.checkAuthRateLimit([bucketB], { db })).locked, false);

  await db.authRateLimitBucket.deleteMany({ where: { bucketKey: { in: [facilityA, facilityB] } } });
});

test("stored rows contain no raw credential material", { skip }, async () => {
  const { db, lib, BucketType } = await getSuite();
  const email = "raw.credential.check@example.com";
  const pin = "913844";
  const facilityId = uniqueKey("privacy_facility");

  const buckets = [
    { key: lib.passwordAccountBucketKey(email), type: BucketType.PASSWORD_ACCOUNT },
    { key: lib.pinCandidateBucketKey(facilityId, pin), type: BucketType.PIN_CANDIDATE },
    { key: lib.pinFacilityBucketKey(facilityId), type: BucketType.PIN_FACILITY },
  ];
  await lib.registerAuthFailure(buckets, { db });

  const keys = buckets.map((b) => b.key);
  const rows = await db.authRateLimitBucket.findMany({ where: { bucketKey: { in: keys } } });
  assert.equal(rows.length, 3);
  const serialized = JSON.stringify(rows);
  assert.ok(!serialized.includes(email), "no raw email may be stored");
  assert.ok(!serialized.includes(pin), "no raw PIN may be stored");
  assert.ok(!serialized.includes(facilityId), "facility id must be hashed into the key");
  for (const row of rows) {
    assert.match(row.bucketKey, /^[0-9a-f]{64}$/);
  }

  await db.authRateLimitBucket.deleteMany({ where: { bucketKey: { in: keys } } });
});

test("cleanup removes stale buckets but preserves active locks", { skip }, async () => {
  const { db, lib, BucketType } = await getSuite();
  const staleKey = uniqueKey("stale");
  const lockedKey = uniqueKey("locked");
  const now = new Date();
  const longAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

  await lib.registerAuthFailure(
    [
      {
        key: staleKey,
        type: BucketType.PASSWORD_ACCOUNT,
        policyOverrides: { threshold: 99, windowMs: 60_000, lockMs: 60_000 },
      },
    ],
    { db, now: longAgo },
  );
  // Locked long ago but with a lock that still extends past `now`, so cleanup must skip it.
  await lib.registerAuthFailure(
    [
      {
        key: lockedKey,
        type: BucketType.PASSWORD_ACCOUNT,
        policyOverrides: { threshold: 1, windowMs: 60_000, lockMs: 11 * 24 * 60 * 60 * 1000 },
      },
    ],
    { db, now: longAgo },
  );

  await lib.cleanupAuthRateLimitBuckets({ db, now, retentionMs: 24 * 60 * 60 * 1000 });

  assert.equal(
    await db.authRateLimitBucket.findUnique({ where: { bucketKey: staleKey } }),
    null,
    "stale unlocked bucket should be pruned",
  );
  const stillLocked = await db.authRateLimitBucket.findUnique({ where: { bucketKey: lockedKey } });
  assert.ok(stillLocked, "cleanup must not cut an active lock short");

  await db.authRateLimitBucket.deleteMany({ where: { bucketKey: { in: [staleKey, lockedKey] } } });
});

after(async () => {
  await suite?.db.$disconnect();
});
