#!/usr/bin/env node
/**
 * Static verification gate: discovery sentinel, migration integrity, hygiene,
 * typecheck, lint, prisma validate. No database.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function run(label, command, args) {
  console.log(`\n=== ${label} ===`);
  const env = { ...process.env };
  delete env.NODE_ENV;
  const result = spawnSync(command, args, { cwd: ROOT, env, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`verify-static: FAIL — ${label} exited ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

run("test-discovery-sentinel", process.execPath, [
  join(ROOT, "scripts/verify/test-discovery-sentinel.mjs"),
]);
run("migration-integrity", process.execPath, [
  join(ROOT, "scripts/verify/migration-integrity.mjs"),
]);
run("repository-hygiene", process.execPath, [
  join(ROOT, "scripts/verify/repository-hygiene.mjs"),
]);
run("typecheck", "npx", ["tsc", "--noEmit"]);
run("lint", "npx", ["eslint", "."]);
run("prisma validate", "npx", ["prisma", "validate"]);

console.log("\nverify-static: PASS");
