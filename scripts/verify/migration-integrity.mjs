#!/usr/bin/env node
/**
 * Migration directory integrity — tracking, ordering, completeness.
 *
 * Does not apply migrations. Pair with verify:db for empty-database deploy + seed.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { verifyRepoMigrationChecksums } from "./lib/migration-checksum.mjs";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "prisma", "migrations");

function fail(message) {
  console.error(`migration-integrity: FAIL — ${message}`);
  process.exit(1);
}

function listMigrationDirs() {
  if (!existsSync(MIGRATIONS_DIR)) {
    fail("prisma/migrations directory is missing");
  }
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    // Timestamp prefix is required; a descriptive suffix after `_` is preferred but not
    // historically universal (one early directory is digits-only).
    .filter((e) => e.isDirectory() && /^\d{14}(_[A-Za-z0-9_]+)?$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

function gitTrackedMigrations() {
  try {
    const out = execSync("git ls-files prisma/migrations", {
      cwd: ROOT,
      encoding: "utf8",
    });
    return out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    fail("unable to list git-tracked migrations (is this a git checkout?)");
  }
}

function main() {
  const dirs = listMigrationDirs();
  if (dirs.length === 0) {
    fail("no migration directories found");
  }

  // Unique names
  const unique = new Set(dirs);
  if (unique.size !== dirs.length) {
    fail("duplicate migration directory names");
  }

  // Deterministic order: lexicographic on the timestamp prefix equals chronological for YYYYMMDDHHMMSS
  const sorted = [...dirs].sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < dirs.length; i++) {
    if (dirs[i] !== sorted[i]) {
      fail(`migration directories are not deterministically ordered at ${dirs[i]}`);
    }
  }

  // Each directory has migration.sql and is non-empty
  for (const dir of dirs) {
    const sql = join(MIGRATIONS_DIR, dir, "migration.sql");
    if (!existsSync(sql)) {
      fail(`missing migration.sql in ${dir}`);
    }
    const size = statSync(sql).size;
    if (size === 0) {
      fail(`empty migration.sql in ${dir}`);
    }
  }

  // Every on-disk migration directory must be tracked; every tracked migration.sql must exist.
  const tracked = gitTrackedMigrations();
  const trackedDirs = new Set(
    tracked
      .map((p) => {
        const m = /^prisma\/migrations\/([^/]+)\//.exec(p);
        return m?.[1];
      })
      .filter(Boolean),
  );

  for (const dir of dirs) {
    if (!trackedDirs.has(dir)) {
      fail(`migration directory is not tracked by git: ${dir}`);
    }
    const sqlPath = `prisma/migrations/${dir}/migration.sql`;
    if (!tracked.includes(sqlPath)) {
      fail(`migration.sql is not tracked by git: ${sqlPath}`);
    }
  }

  // Tracked migration.sql whose directory is missing on disk
  for (const path of tracked) {
    if (!path.endsWith("/migration.sql")) continue;
    if (!existsSync(join(ROOT, path))) {
      fail(`tracked migration.sql missing from working tree: ${path}`);
    }
  }

  // lock file present
  if (!existsSync(join(MIGRATIONS_DIR, "migration_lock.toml"))) {
    fail("migration_lock.toml is missing");
  }

  const checksums = verifyRepoMigrationChecksums({ migrationsDir: MIGRATIONS_DIR });
  if (!checksums.pass) {
    fail(checksums.message ?? "migration checksum manifest verification failed");
  }
  if (checksums.exceptionCount > 0) {
    console.log(`  documented checksum exceptions: ${checksums.exceptionCount}`);
  }

  console.log(`migration-integrity: PASS — ${dirs.length} migrations`);
  console.log(`  newest: ${dirs[dirs.length - 1]}`);
  console.log(`  oldest: ${dirs[0]}`);
}

main();
