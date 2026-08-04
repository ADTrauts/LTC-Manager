import { randomUUID } from "node:crypto";

import { AuthRateLimitBucketType, Prisma, type PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/prisma";

import {
  AUTH_RATE_LIMIT_MAX_RETRY_AFTER_SEC,
  AUTH_RATE_LIMIT_RETENTION_MS,
  resolvePolicy,
  type AuthRateLimitPolicy,
} from "./config";

export {
  normalizeAccountIdentifier,
  passwordAccountBucketKey,
  pinCandidateBucketKey,
  pinFacilityBucketKey,
} from "./keys";
export { AUTH_RATE_LIMIT_POLICIES, resolvePolicy } from "./config";

/** Minimal client surface so tests and transactions can supply their own handle. */
export type AuthRateLimitDb = Pick<PrismaClient, "$queryRaw" | "$executeRaw">;

export type AuthRateLimitBucketRef = {
  key: string;
  type: AuthRateLimitBucketType;
  /** Test-only tightening of thresholds; production paths omit this. */
  policyOverrides?: Partial<AuthRateLimitPolicy>;
};

export type AuthRateLimitDecision =
  | { locked: false }
  | { locked: true; retryAfterSec: number; bucketType: AuthRateLimitBucketType };

/**
 * Bind an instant to a `timestamp(3)` column as UTC wall-clock.
 *
 * Raw parameters are serialized in the server's local zone, while reads of a timestamp column are
 * interpreted as UTC. Left alone, every stored instant is skewed by the host's UTC offset, which
 * makes `Retry-After` and lock arithmetic depend on where the process runs. Converting explicitly
 * keeps these columns on the same UTC convention Prisma applies to the rest of the schema.
 */
function utcTimestamp(value: Date) {
  return Prisma.sql`${value.toISOString()}::timestamptz AT TIME ZONE 'UTC'`;
}

function retryAfterSeconds(lockedUntil: Date, now: Date): number {
  const seconds = Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
  return Math.min(Math.max(seconds, 1), AUTH_RATE_LIMIT_MAX_RETRY_AFTER_SEC);
}

/**
 * Read-only check across every bucket that guards a request. Returns the longest active lock so
 * the caller reports a single consistent `Retry-After`.
 */
export async function checkAuthRateLimit(
  buckets: readonly AuthRateLimitBucketRef[],
  options?: { db?: AuthRateLimitDb; now?: Date },
): Promise<AuthRateLimitDecision> {
  if (buckets.length === 0) {
    return { locked: false };
  }
  const db = options?.db ?? defaultPrisma;
  const now = options?.now ?? new Date();
  const keys = buckets.map((b) => b.key);

  const rows = await db.$queryRaw<
    { bucketKey: string; bucketType: AuthRateLimitBucketType; lockedUntil: Date | null }[]
  >`
    SELECT "bucketKey", "bucketType", "lockedUntil"
    FROM "AuthRateLimitBucket"
    WHERE "bucketKey" IN (${Prisma.join(keys)})
      AND "lockedUntil" IS NOT NULL
      AND "lockedUntil" > ${utcTimestamp(now)}
  `;

  let worst: { lockedUntil: Date; bucketType: AuthRateLimitBucketType } | null = null;
  for (const row of rows) {
    if (row.lockedUntil && (!worst || row.lockedUntil > worst.lockedUntil)) {
      worst = { lockedUntil: row.lockedUntil, bucketType: row.bucketType };
    }
  }
  if (!worst) {
    return { locked: false };
  }
  return {
    locked: true,
    retryAfterSec: retryAfterSeconds(worst.lockedUntil, now),
    bucketType: worst.bucketType,
  };
}

/**
 * Atomically record one failure against a bucket.
 *
 * The whole read-modify-write happens inside a single `INSERT ... ON CONFLICT DO UPDATE`, so
 * concurrent requests serialize on the row lock and cannot lose increments or slip past the
 * threshold. Doing this in application code would require an explicit row lock and a
 * transaction round trip per attempt.
 */
async function registerFailureForBucket(
  db: AuthRateLimitDb,
  bucket: AuthRateLimitBucketRef,
  now: Date,
): Promise<void> {
  const policy = resolvePolicy(bucket.type, bucket.policyOverrides);
  const windowCutoff = new Date(now.getTime() - policy.windowMs);
  const lockedUntil = new Date(now.getTime() + policy.lockMs);
  const typeValue = bucket.type;
  // The insert branch is this bucket's first failure, so it locks immediately only when a single
  // failure already meets the threshold.
  const nowTs = utcTimestamp(now);
  const cutoffTs = utcTimestamp(windowCutoff);
  const lockTs = utcTimestamp(lockedUntil);
  const initialLockTs = policy.threshold <= 1 ? lockTs : Prisma.sql`NULL`;

  await db.$executeRaw`
    INSERT INTO "AuthRateLimitBucket"
      ("id", "bucketKey", "bucketType", "windowStartedAt", "attemptCount",
       "lastAttemptAt", "lockedUntil", "createdAt", "updatedAt")
    VALUES (
      ${randomUUID()}, ${bucket.key}, ${typeValue}::"AuthRateLimitBucketType",
      ${nowTs}, 1, ${nowTs}, ${initialLockTs}, ${nowTs}, ${nowTs}
    )
    ON CONFLICT ("bucketKey") DO UPDATE SET
      "attemptCount" = CASE
        WHEN "AuthRateLimitBucket"."windowStartedAt" <= ${cutoffTs} THEN 1
        ELSE "AuthRateLimitBucket"."attemptCount" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "AuthRateLimitBucket"."windowStartedAt" <= ${cutoffTs} THEN ${nowTs}
        ELSE "AuthRateLimitBucket"."windowStartedAt"
      END,
      "lastAttemptAt" = ${nowTs},
      "lockedUntil" = CASE
        WHEN (
          CASE
            WHEN "AuthRateLimitBucket"."windowStartedAt" <= ${cutoffTs} THEN 1
            ELSE "AuthRateLimitBucket"."attemptCount" + 1
          END
        ) >= ${policy.threshold} THEN ${lockTs}
        ELSE "AuthRateLimitBucket"."lockedUntil"
      END,
      "updatedAt" = ${nowTs}
  `;
}

/** Record a failed authentication attempt against every applicable bucket. */
export async function registerAuthFailure(
  buckets: readonly AuthRateLimitBucketRef[],
  options?: { db?: AuthRateLimitDb; now?: Date },
): Promise<void> {
  const db = options?.db ?? defaultPrisma;
  const now = options?.now ?? new Date();
  for (const bucket of buckets) {
    await registerFailureForBucket(db, bucket, now);
  }
}

/**
 * Clear a bucket after a genuine success.
 *
 * Callers pass only the narrow bucket that the successful credential owns. Broad buckets such as
 * PIN_FACILITY are deliberately never reset here: one valid login must not erase evidence of
 * unrelated guessing against the same facility.
 */
export async function resetAuthRateLimitBucket(
  key: string,
  options?: { db?: AuthRateLimitDb },
): Promise<void> {
  const db = options?.db ?? defaultPrisma;
  await db.$executeRaw`DELETE FROM "AuthRateLimitBucket" WHERE "bucketKey" = ${key}`;
}

/**
 * Bound table growth. Removes buckets that are past the retention horizon and not currently
 * locked, so an active lock is never cut short by cleanup.
 */
export async function cleanupAuthRateLimitBuckets(options?: {
  db?: AuthRateLimitDb;
  now?: Date;
  retentionMs?: number;
}): Promise<number> {
  const db = options?.db ?? defaultPrisma;
  const now = options?.now ?? new Date();
  const retentionMs = options?.retentionMs ?? AUTH_RATE_LIMIT_RETENTION_MS;
  const cutoff = new Date(now.getTime() - retentionMs);

  return db.$executeRaw`
    DELETE FROM "AuthRateLimitBucket"
    WHERE "lastAttemptAt" < ${utcTimestamp(cutoff)}
      AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${utcTimestamp(now)})
  `;
}

export { AuthRateLimitBucketType };
