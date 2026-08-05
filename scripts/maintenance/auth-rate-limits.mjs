#!/usr/bin/env node
/**
 * Provider-neutral AuthRateLimitBucket cleanup.
 *
 * Deletes only expired, unlocked buckets per Phase 1 retention policy.
 * Never removes an active lock. Not a production scheduler — operators or a future
 * platform must invoke this on a cadence.
 *
 * Usage:
 *   MAINTENANCE_DATABASE_URL=postgresql://…/ltc_verify_x npm run maintenance:auth-rate-limits
 *   … --dry-run
 */
import { PrismaClient } from "@prisma/client";

import {
  assertDisposableDatabaseUrl,
  redactDatabaseUrl,
} from "../verify/lib/database-target.mjs";

// Retention matches src/lib/auth-rate-limit/config.ts AUTH_RATE_LIMIT_RETENTION_MS
const RETENTION_MS = 24 * 60 * 60 * 1000;

function fail(message) {
  console.error(`maintenance:auth-rate-limits: FAIL — ${message}`);
  process.exit(1);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.MAINTENANCE_DATABASE_URL || process.env.VERIFY_DATABASE_URL;
  let target;
  try {
    target = assertDisposableDatabaseUrl(url);
  } catch (err) {
    fail(
      `${err.message} Set MAINTENANCE_DATABASE_URL to a disposable database. ltc_manager is refused.`,
    );
  }

  console.log(
    `maintenance:auth-rate-limits: ${dryRun ? "DRY-RUN " : ""}target ${target.databaseName} @ ${target.host}`,
  );
  console.log(`maintenance:auth-rate-limits: ${redactDatabaseUrl(url)}`);

  const db = new PrismaClient({ datasources: { db: { url } } });
  const now = new Date();
  const cutoff = new Date(now.getTime() - RETENTION_MS);

  try {
    const eligible = await db.$queryRaw`
      SELECT COUNT(*)::int AS count FROM "AuthRateLimitBucket"
      WHERE "lastAttemptAt" < ${cutoff}
        AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${now})
    `;
    const activeLocks = await db.$queryRaw`
      SELECT COUNT(*)::int AS count FROM "AuthRateLimitBucket"
      WHERE "lockedUntil" IS NOT NULL AND "lockedUntil" > ${now}
    `;
    const eligibleCount = Number(eligible[0]?.count ?? 0);
    const activeLockCount = Number(activeLocks[0]?.count ?? 0);

    console.log(`  eligible for deletion: ${eligibleCount}`);
    console.log(`  active locks preserved: ${activeLockCount}`);

    if (dryRun) {
      console.log("maintenance:auth-rate-limits: DRY-RUN complete (no deletions)");
      return;
    }

    const deleted = await db.$executeRaw`
      DELETE FROM "AuthRateLimitBucket"
      WHERE "lastAttemptAt" < ${cutoff}
        AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${now})
    `;

    console.log(`  deleted: ${Number(deleted)}`);
    console.log("maintenance:auth-rate-limits: PASS");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  fail(err.message);
});
