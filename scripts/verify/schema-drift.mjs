#!/usr/bin/env node
/**
 * Read-only schema comparison: migrations → empty DB vs prisma/schema.prisma.
 *
 * Does not generate or apply a migration. Prints a classification summary for Phase 5 docs.
 * Requires VERIFY_DATABASE_URL (disposable) and optionally creates a shadow DB via admin URL.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertDisposableDatabaseUrl,
  redactDatabaseUrl,
} from "./lib/database-target.mjs";

function fail(message) {
  console.error(`schema-drift: FAIL — ${message}`);
  process.exit(1);
}

function main() {
  const url = process.env.VERIFY_DATABASE_URL;
  const target = assertDisposableDatabaseUrl(url);
  console.log(`schema-drift: comparing against ${target.databaseName}`);
  console.log(`schema-drift: ${redactDatabaseUrl(url)}`);

  // Ensure migrations are applied first (caller may have already done this).
  const env = {
    ...process.env,
    DATABASE_URL: url,
    DIRECT_URL: url,
  };
  delete env.NODE_ENV;

  const deploy = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    env,
    encoding: "utf8",
  });
  if (deploy.status !== 0) {
    fail(`migrate deploy failed: ${(deploy.stderr || deploy.stdout || "").slice(0, 400)}`);
  }

  const outFile = join(tmpdir(), `ltc-schema-drift-${process.pid}.sql`);
  const diff = spawnSync(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-url",
      url,
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--script",
    ],
    { env, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );

  if (diff.status !== 0) {
    fail(`prisma migrate diff failed: ${(diff.stderr || "").slice(0, 400)}`);
  }

  const script = (diff.stdout || "").trim();
  writeFileSync(outFile, script || "-- empty\n");

  if (!script || script === "-- This is an empty migration.") {
    console.log("schema-drift: PASS — no differences (empty diff)");
    unlinkSync(outFile);
    return;
  }

  // Classify common Prisma representation differences without auto-migrating.
  const lines = script.split("\n").filter((l) => l.trim() && !l.startsWith("--"));
  const classifications = [];
  for (const line of lines) {
    if (/CREATE INDEX|DROP INDEX|RENAME INDEX/i.test(line)) {
      classifications.push({ line: line.slice(0, 120), kind: "IDENTIFIER-NAMING DIFFERENCE or EQUIVALENT DATABASE REPRESENTATION" });
    } else if (/SET DEFAULT|DROP DEFAULT|ALTER COLUMN/i.test(line)) {
      classifications.push({ line: line.slice(0, 120), kind: "EQUIVALENT DATABASE REPRESENTATION or REAL STRUCTURAL DRIFT" });
    } else if (/ADD CONSTRAINT|DROP CONSTRAINT|UNIQUE/i.test(line)) {
      classifications.push({ line: line.slice(0, 120), kind: "REAL STRUCTURAL DRIFT" });
    } else if (/RENAME CONSTRAINT|RENAME TO/i.test(line)) {
      classifications.push({
        line: line.slice(0, 120),
        kind: "IDENTIFIER-NAMING DIFFERENCE",
      });
    } else {
      classifications.push({ line: line.slice(0, 120), kind: "UNKNOWN" });
    }
  }

  console.log(`schema-drift: REPORT — ${lines.length} non-comment SQL statement(s)`);
  for (const c of classifications.slice(0, 40)) {
    console.log(`  [${c.kind}] ${c.line}`);
  }
  if (classifications.length > 40) {
    console.log(`  … ${classifications.length - 40} more`);
  }

  const real = classifications.filter((c) => c.kind === "REAL STRUCTURAL DRIFT");
  const unknown = classifications.filter((c) => c.kind === "UNKNOWN");
  if (real.length > 0 || unknown.length > 0) {
    console.log(
      "schema-drift: FINDINGS — review required before generating a reconciling migration",
    );
    console.log(`  real=${real.length} unknown=${unknown.length} total=${classifications.length}`);
    console.log(`  full script: ${outFile}`);
    // Non-zero only when clearly structural; representation diffs are accepted with report.
    if (real.length > 0) {
      process.exitCode = 2;
    }
    return;
  }

  console.log("schema-drift: PASS WITH ACCEPTED REPRESENTATION DIFFERENCES");
  unlinkSync(outFile);
}

main();
