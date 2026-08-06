#!/usr/bin/env node
/**
 * Provider-neutral AuthRateLimitBucket cleanup.
 *
 * Deletes only expired, unlocked buckets per Phase 1 retention policy.
 * Never removes an active lock. Not a production scheduler — operators or a future
 * platform must invoke this on a cadence.
 *
 * Usage (disposable / CI):
 *   MAINTENANCE_DATABASE_URL=postgresql://…/ltc_verify_x npm run maintenance:auth-rate-limits
 *   … --dry-run
 *
 * Usage (pilot / staging — never ltc_manager):
 *   MAINTENANCE_ALLOW_PILOT=1 \
 *   MAINTENANCE_CONFIRM_DATABASE_NAME='ltc_pilot_terrace_view' \
 *   MAINTENANCE_DATABASE_URL='postgresql://…/ltc_pilot_terrace_view' \
 *   npm run maintenance:auth-rate-limits -- --dry-run
 */
import { PrismaClient } from "@prisma/client";

import {
  FORBIDDEN_DATABASE_NAMES,
  assertDisposableDatabaseUrl,
  evaluateDatabaseTarget,
  parseDatabaseName,
  redactDatabaseUrl,
} from "../verify/lib/database-target.mjs";

// Retention matches src/lib/auth-rate-limit/config.ts AUTH_RATE_LIMIT_RETENTION_MS
const RETENTION_MS = 24 * 60 * 60 * 1000;

function fail(message) {
  console.error(`maintenance:auth-rate-limits: FAIL — ${message}`);
  process.exit(1);
}

function resolveMaintenanceTarget(url) {
  const allowPilot = process.env.MAINTENANCE_ALLOW_PILOT === "1";
  const confirmName = (process.env.MAINTENANCE_CONFIRM_DATABASE_NAME ?? "").trim();

  if (!allowPilot) {
    try {
      return assertDisposableDatabaseUrl(url);
    } catch (err) {
      fail(
        `${err.message} For disposable targets set MAINTENANCE_DATABASE_URL to ltc_verify_*/ltc_test_*/ltc_ci_*. ` +
          "For pilot/staging set MAINTENANCE_ALLOW_PILOT=1 and MAINTENANCE_CONFIRM_DATABASE_NAME=<exact db name>. " +
          "ltc_manager is always refused.",
      );
    }
  }

  const databaseName = parseDatabaseName(url);
  if (!databaseName) fail("MAINTENANCE_DATABASE_URL could not be parsed.");
  if (FORBIDDEN_DATABASE_NAMES.has(databaseName)) {
    fail("Database name ltc_manager is forbidden for maintenance.");
  }
  if (!confirmName) {
    fail("MAINTENANCE_CONFIRM_DATABASE_NAME is required when MAINTENANCE_ALLOW_PILOT=1.");
  }
  if (confirmName !== databaseName) {
    fail(
      `MAINTENANCE_CONFIRM_DATABASE_NAME (${confirmName}) does not match URL database (${databaseName}).`,
    );
  }

  // Disposable path remains available under pilot flag; non-disposable is explicit.
  const decision = evaluateDatabaseTarget(url);
  if (decision.ok) {
    return { databaseName: decision.databaseName, host: decision.host, mode: "disposable" };
  }

  let host = "(unknown)";
  try {
    host = new URL(url).hostname || host;
  } catch {
    /* ignore */
  }
  return { databaseName, host, mode: "pilot" };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.MAINTENANCE_DATABASE_URL || process.env.VERIFY_DATABASE_URL;
  if (!url?.trim()) {
    fail("MAINTENANCE_DATABASE_URL (or VERIFY_DATABASE_URL) is required.");
  }
  const target = resolveMaintenanceTarget(url);

  console.log(
    `maintenance:auth-rate-limits: ${dryRun ? "DRY-RUN " : ""}target ${target.databaseName} @ ${target.host}` +
      (target.mode ? ` (${target.mode})` : ""),
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
