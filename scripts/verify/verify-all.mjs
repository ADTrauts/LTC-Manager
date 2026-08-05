#!/usr/bin/env node
/**
 * Complete repository verification gate — deterministic order.
 *
 * 1. Static + hermetic tests + production build
 * 2. Database verification (migrate, seed×2, SQL-backed tests)
 *
 * Requires VERIFY_DATABASE_URL for the database half. Does not default to ltc_manager.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { assertDisposableDatabaseUrl, redactDatabaseUrl } from "./lib/database-target.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function run(label, command, args, env = process.env) {
  console.log(`\n######## ${label} ########`);
  const clean = { ...env };
  delete clean.NODE_ENV;
  const result = spawnSync(command, args, { cwd: ROOT, env: clean, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`verify-all: FAIL — ${label} exited ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

const url = process.env.VERIFY_DATABASE_URL;
try {
  const target = assertDisposableDatabaseUrl(url);
  console.log(`verify-all: disposable database ${target.databaseName} @ ${target.host}`);
  console.log(`verify-all: ${redactDatabaseUrl(url)}`);
} catch (err) {
  console.error(`verify-all: FAIL — ${err.message}`);
  console.error(
    "Set VERIFY_DATABASE_URL to a disposable database (ltc_verify_*, ltc_test_*, or ltc_ci_*).",
  );
  process.exit(1);
}

run("verify:static", process.execPath, [join(ROOT, "scripts/verify/verify-static.mjs")]);
run("test:hermetic", process.execPath, [join(ROOT, "scripts/verify/run-tests.mjs"), "hermetic"]);
run("verify:build", process.execPath, [join(ROOT, "scripts/verify/verify-build.mjs")]);
run("verify:db", process.execPath, [join(ROOT, "scripts/verify/verify-db.mjs")], {
  ...process.env,
  VERIFY_DATABASE_URL: url,
});

console.log("\nverify-all: PASS");
