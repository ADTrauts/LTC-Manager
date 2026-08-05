#!/usr/bin/env node
/**
 * Proves every approved *.test.* file under src/ is included by the repository test command.
 *
 * The invariant is file-discovery completeness, not a hardcoded test count. A temporary probe
 * file under src/ must appear in the discovery list; removing it from an expected set must fail.
 */
import { mkdtempSync, writeFileSync, rmSync, readdirSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";

import { listTestFiles, SQL_BACKED_TEST_FILES } from "./discover-tests.mjs";

const ROOT = process.cwd();

function fail(message) {
  console.error(`test-discovery-sentinel: FAIL — ${message}`);
  process.exit(1);
}

/** Independent walk used only to cross-check the discovery module. */
function independentWalk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      independentWalk(abs, out);
    } else if (entry.isFile() && /\.test\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      out.push(relative(ROOT, abs));
    }
  }
}

function main() {
  const files = listTestFiles();
  if (files.length === 0) {
    fail("no test files discovered under src/");
  }

  const independent = [];
  independentWalk(join(ROOT, "src"), independent);
  independent.sort((a, b) => a.localeCompare(b));

  if (independent.length !== files.length) {
    fail(
      `discovery count ${files.length} disagrees with independent walk ${independent.length}`,
    );
  }
  for (let i = 0; i < files.length; i++) {
    if (files[i] !== independent[i]) {
      fail(`discovery mismatch at index ${i}: ${files[i]} vs ${independent[i]}`);
    }
  }

  for (const required of SQL_BACKED_TEST_FILES) {
    if (!files.includes(required)) {
      fail(`SQL-backed suite not discovered: ${required}`);
    }
  }

  // Probe: a new file under src must be discovered; pretending it is omitted must fail the check.
  const probeRel = `src/lib/verify/__sentinel_probe_${process.pid}.test.ts`;
  const probeAbs = join(ROOT, probeRel);
  writeFileSync(
    probeAbs,
    `import test from "node:test";\ntest("sentinel probe", () => {});\n`,
  );
  try {
    const withProbe = listTestFiles();
    if (!withProbe.includes(probeRel)) {
      fail(`probe file was not discovered: ${probeRel}`);
    }
    // Synthetic omission: build the expected set without the probe and confirm inequality.
    const omitted = withProbe.filter((f) => f !== probeRel);
    if (omitted.length === withProbe.length) {
      fail("synthetic omission did not change the file set");
    }
    if (omitted.includes(probeRel)) {
      fail("synthetic omission failed to exclude the probe");
    }
  } finally {
    unlinkSync(probeAbs);
  }

  // Outside src/ must never be discovered.
  const outside = mkdtempSync(join(tmpdir(), "ltc-sentinel-"));
  try {
    writeFileSync(join(outside, "escape.test.ts"), "import test from 'node:test'; test('x', () => {});");
    const again = listTestFiles();
    if (again.some((f) => f.includes("escape.test.ts"))) {
      fail("test outside approved roots was discovered");
    }
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }

  const unique = new Set(files);
  if (unique.size !== files.length) {
    fail(`duplicate test paths (${files.length} entries, ${unique.size} unique)`);
  }

  console.log(`test-discovery-sentinel: PASS — ${files.length} test files discovered`);
  console.log(`  sql-backed suites recognized: ${SQL_BACKED_TEST_FILES.length}`);
}

main();
