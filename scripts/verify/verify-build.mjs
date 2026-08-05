#!/usr/bin/env node
/**
 * Production build with a clean NODE_ENV.
 *
 * Callers that export NODE_ENV=development must not break `next build`. This wrapper
 * unsets NODE_ENV before invoking the build so Next.js can set production correctly.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const env = { ...process.env };
delete env.NODE_ENV;

console.log("verify-build: running next build with NODE_ENV unset (Next sets production)");
const result = spawnSync("npx", ["next", "build"], { cwd: ROOT, env, stdio: "inherit" });
if (result.status !== 0) {
  console.error(`verify-build: FAIL — exit ${result.status ?? 1}`);
  process.exit(result.status ?? 1);
}
console.log("verify-build: PASS");
