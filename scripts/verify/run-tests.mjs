#!/usr/bin/env node
/**
 * Cross-platform test runner used by npm test / test:hermetic / test:db.
 *
 * Modes:
 *   (default)  — discover all tests and run them (same as npm test)
 *   hermetic   — unset SQL-backed env vars so DB suites skip intentionally
 *   db         — require VERIFY_DATABASE_URL (or the four suite vars), assert disposable, run all
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { listTestFiles, SQL_BACKED_TEST_FILES } from "./discover-tests.mjs";
import {
  assertDisposableDatabaseUrl,
  SQL_BACKED_DATABASE_ENV_KEYS,
  redactDatabaseUrl,
} from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fail(message) {
  console.error(`run-tests: FAIL — ${message}`);
  process.exit(1);
}

function resolveDbUrl() {
  const shared = process.env.VERIFY_DATABASE_URL;
  if (shared) {
    assertDisposableDatabaseUrl(shared);
    return shared;
  }
  const values = SQL_BACKED_DATABASE_ENV_KEYS.map((k) => process.env[k]).filter(Boolean);
  if (values.length === 0) {
    fail(
      "VERIFY_DATABASE_URL (or the four SQL-backed suite env vars) is required for test:db",
    );
  }
  const first = values[0];
  for (const v of values) {
    if (v !== first) {
      fail("SQL-backed suite database URLs must all point at the same disposable database");
    }
  }
  assertDisposableDatabaseUrl(first);
  return first;
}

function main() {
  try {
    const mode = process.argv[2] ?? "all";
    const files = listTestFiles();
    if (files.length === 0) fail("no test files discovered");

    const env = { ...process.env };
    // Never inherit a poisoned NODE_ENV into the test process from a broken caller.
    // node:test itself does not require production; leave NODE_ENV unset unless caller set test.
    if (env.NODE_ENV === "production") {
      delete env.NODE_ENV;
    }
    // GitHub-hosted runners default to UTC. Many tests use timezone-less Date strings that
    // represent facility-local America/New_York instants; always pin TZ so hermetic runs are
    // portable even when the caller exports TZ=UTC (common CI default / verification matrix).
    env.TZ = "America/New_York";

    if (mode === "hermetic") {
      for (const key of SQL_BACKED_DATABASE_ENV_KEYS) {
        delete env[key];
      }
      delete env.VERIFY_DATABASE_URL;
      console.log(`run-tests: hermetic — ${files.length} files (SQL-backed suites will skip)`);
    } else if (mode === "db") {
      const url = resolveDbUrl();
      for (const key of SQL_BACKED_DATABASE_ENV_KEYS) {
        env[key] = url;
      }
      env.VERIFY_DATABASE_URL = url;
      env.DATABASE_URL = url;
      env.DIRECT_URL = url;
      if (!env.AUTH_SECRET) {
        env.AUTH_SECRET = "phase5-verify-auth-secret-not-for-production";
      }
      const target = assertDisposableDatabaseUrl(url);
      console.log(
        `run-tests: db — ${files.length} files against ${target.databaseName} @ ${target.host}`,
      );
      console.log(`  connection: ${redactDatabaseUrl(url)}`);
      for (const f of SQL_BACKED_TEST_FILES) {
        console.log(`  sql-backed: ${f}`);
      }
    } else {
      console.log(`run-tests: all — ${files.length} files`);
    }

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--test", ...files],
      { cwd: ROOT, env, stdio: "inherit" },
    );

    if (result.error) {
      fail(result.error.message);
    }
    process.exit(result.status ?? 1);
  } catch (err) {
    fail(err.message || String(err));
  }
}

main();
