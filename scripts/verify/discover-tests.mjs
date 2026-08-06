#!/usr/bin/env node
/**
 * Cross-platform test-file discovery for hermetic and SQL-backed runs.
 *
 * Replaces `find src -name '*.test.ts'` so discovery does not depend on shell globbing
 * or ARG_MAX limits, and so a sentinel can prove every approved test file is included.
 */
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const APPROVED_ROOTS = ["src"];
const TEST_EXTENSIONS = [".test.ts", ".test.tsx", ".test.mjs", ".test.js"];

export function listTestFiles(roots = APPROVED_ROOTS) {
  const files = [];
  for (const root of roots) {
    const abs = join(ROOT, root);
    walk(abs, files);
  }
  return files
    .map((abs) => relative(ROOT, abs))
    .sort((a, b) => a.localeCompare(b));
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
      continue;
    }
    if (entry.isFile() && TEST_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      out.push(abs);
    }
  }
}

/** Files that SQL-backed suites live in (opt-in via env; still discovered hermetically as skipped). */
export const SQL_BACKED_TEST_FILES = [
  "src/lib/auth-rate-limit/auth-rate-limit.test.ts",
  "src/lib/servery/record-milestone.test.ts",
  "src/lib/session-revocation/session-version.test.ts",
  "src/lib/staffing/assignment-references.test.ts",
  "src/lib/offline/runtime-api.test.ts",
  "src/lib/scheduling/operational-assignments/phase-7a-assignment.test.ts",
  "src/lib/operational-cycles/phase-9a-cycles.test.ts",
  "src/lib/dietary-job-flow/phase-9b-job-flow.test.ts",
  "src/lib/operational-evidence/phase-9c1-template-builder.test.ts",
];

function main() {
  const mode = process.argv[2] ?? "list";
  const files = listTestFiles();

  if (mode === "count") {
    console.log(String(files.length));
    return;
  }

  if (mode === "json") {
    console.log(JSON.stringify({ count: files.length, files }, null, 2));
    return;
  }

  // Default: one relative path per line for `tsx --test $(...)` replacement via xargs / spawn.
  for (const file of files) {
    console.log(file);
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith("discover-tests.mjs");
if (isMain) {
  main();
}
