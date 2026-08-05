#!/usr/bin/env node
/**
 * Empty-database verification: migrate deploy, seed twice, SQL-backed tests, schema assertions.
 *
 * Requires VERIFY_DATABASE_URL pointing at a disposable database (ltc_verify_*, ltc_test_*, ltc_ci_*).
 * Refuses ltc_manager.
 *
 * When VERIFY_MANAGE_DATABASE=1 and VERIFY_DATABASE_ADMIN_URL is set (typically …/postgres),
 * this script creates the disposable database before work and drops it afterward — including on
 * failure.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  dropDisposableDatabase,
  recreateDisposableDatabase,
} from "./admin-database.mjs";
import {
  assertDisposableDatabaseUrl,
  redactDatabaseUrl,
  SQL_BACKED_DATABASE_ENV_KEYS,
} from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fail(message) {
  console.error(`verify-db: FAIL — ${message}`);
  process.exit(1);
}

function run(command, args, env, label) {
  console.log(`verify-db: ${label}`);
  const result = spawnSync(command, args, { cwd: ROOT, env, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    fail(`${label} exited ${result.status ?? 1}`);
  }
}

function logAdminUrl(adminUrl) {
  console.log(`verify-db: admin ${redactDatabaseUrl(adminUrl)}`);
}

async function assertSchema(env) {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const migrations = await db.$queryRaw`
      SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
    `;
    const migrationCount = Number(migrations[0]?.count ?? 0);
    if (migrationCount < 1) fail("no finished migrations after deploy");

    const sessionCols = await db.$queryRaw`
      SELECT table_name::text AS table_name FROM information_schema.columns
      WHERE column_name = 'sessionVersion' AND table_name IN ('User', 'Employee')
    `;
    if (sessionCols.length < 2) {
      fail("sessionVersion columns missing on User/Employee after migrate");
    }

    const rateLimit = await db.$queryRaw`
      SELECT COUNT(*)::int AS count FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'AuthRateLimitBucket'
    `;
    if (Number(rateLimit[0]?.count ?? 0) < 1) fail("AuthRateLimitBucket missing");

    const roles = await db.role.count();
    if (roles < 1) fail("seed did not create roles");

    const facilities = await db.facility.count();
    if (facilities < 1) fail("seed did not create a facility");

    console.log(`verify-db: schema assertions PASS — migrations=${migrationCount} roles=${roles}`);
    return migrationCount;
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const url = process.env.VERIFY_DATABASE_URL;
  let created = false;
  let databaseName;
  let exitCode = 0;

  try {
    const target = assertDisposableDatabaseUrl(url);
    databaseName = target.databaseName;
    console.log(`verify-db: target ${databaseName} @ ${target.host}`);
    console.log(`verify-db: connection ${redactDatabaseUrl(url)}`);

    const manage = process.env.VERIFY_MANAGE_DATABASE === "1";
    const adminUrl = process.env.VERIFY_DATABASE_ADMIN_URL;

    if (manage) {
      if (!adminUrl) fail("VERIFY_DATABASE_ADMIN_URL is required when VERIFY_MANAGE_DATABASE=1");
      logAdminUrl(adminUrl);
      await recreateDisposableDatabase(adminUrl, databaseName);
      created = true;
      console.log(`verify-db: created disposable database ${databaseName}`);
    }

    const env = {
      ...process.env,
      DATABASE_URL: url,
      DIRECT_URL: url,
      AUTH_SECRET: process.env.AUTH_SECRET || "phase5-verify-auth-secret-not-for-production",
      VERIFY_DATABASE_URL: url,
    };
    for (const key of SQL_BACKED_DATABASE_ENV_KEYS) {
      env[key] = url;
    }
    delete env.NODE_ENV;

    run("npx", ["prisma", "migrate", "deploy"], env, "prisma migrate deploy");
    run("npx", ["prisma", "db", "seed"], env, "prisma db seed (first)");
    run("npx", ["prisma", "db", "seed"], env, "prisma db seed (second — idempotency)");

    await assertSchema(env);

    run(process.execPath, [join(ROOT, "scripts/verify/run-tests.mjs"), "db"], env, "SQL-backed tests");

    console.log("verify-db: PASS");
  } catch (err) {
    console.error(`verify-db: FAIL — ${err.message}`);
    exitCode = 1;
  } finally {
    if (created && process.env.VERIFY_DATABASE_ADMIN_URL && databaseName) {
      try {
        await dropDisposableDatabase(process.env.VERIFY_DATABASE_ADMIN_URL, databaseName);
        console.log(`verify-db: dropped disposable database ${databaseName}`);
      } catch (cleanupErr) {
        console.error(`verify-db: cleanup warning — ${cleanupErr.message}`);
        if (exitCode === 0) exitCode = 1;
      }
    }
  }
  process.exit(exitCode);
}

main();
