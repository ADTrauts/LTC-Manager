/**
 * Migration checksum governance — repo integrity and documented legacy exceptions.
 *
 * Empty-database migrate deploy always uses on-disk SQL. This module ensures:
 * - Every excepted migration's on-disk sha256 matches the manifest (repo integrity).
 * - Undocumented checksum drift on excepted migrations fails until the manifest is updated.
 * - Legacy databases whose _prisma_migrations checksum differs from the repo file are accepted
 *   only when the migration is listed in the exception manifest with matching repoSha256.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_EXCEPTIONS_PATH = join(
  process.cwd(),
  "scripts",
  "verify",
  "migration-checksum-exceptions.json",
);

const DEFAULT_DOCS_PATH = join(
  process.cwd(),
  "docs",
  "engineering",
  "MIGRATION_HISTORY_EXCEPTIONS.md",
);

export function sha256Hex(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function sha256File(absPath) {
  return sha256Hex(readFileSync(absPath, "utf8"));
}

export function loadMigrationChecksumExceptions(
  exceptionsPath = DEFAULT_EXCEPTIONS_PATH,
) {
  if (!existsSync(exceptionsPath)) {
    throw new Error(`migration checksum exceptions manifest is missing: ${exceptionsPath}`);
  }
  const raw = JSON.parse(readFileSync(exceptionsPath, "utf8"));
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.exceptions)) {
    throw new Error("migration checksum exceptions manifest must contain an exceptions array");
  }
  return raw;
}

/**
 * Verify on-disk migration.sql files match the repo integrity manifest.
 * Returns { pass: true } or { pass: false, message }.
 */
export function verifyRepoMigrationChecksums(options = {}) {
  const migrationsDir =
    options.migrationsDir ?? join(process.cwd(), "prisma", "migrations");
  const exceptionsPath = options.exceptionsPath ?? DEFAULT_EXCEPTIONS_PATH;
  const docsPath = options.docsPath ?? DEFAULT_DOCS_PATH;

  if (!existsSync(docsPath)) {
    return {
      pass: false,
      message: `missing required documentation: ${docsPath}`,
    };
  }

  let manifest;
  try {
    manifest = loadMigrationChecksumExceptions(exceptionsPath);
  } catch (err) {
    return { pass: false, message: err.message };
  }

  const seen = new Set();
  for (const entry of manifest.exceptions) {
    const name = entry?.migration;
    const expected = entry?.repoSha256;
    const doc = entry?.documentedIn;

    if (!name || typeof name !== "string") {
      return { pass: false, message: "exception entry missing migration name" };
    }
    if (!expected || typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) {
      return { pass: false, message: `exception ${name} has invalid repoSha256` };
    }
    if (seen.has(name)) {
      return { pass: false, message: `duplicate exception for migration ${name}` };
    }
    seen.add(name);

    if (doc !== "docs/engineering/MIGRATION_HISTORY_EXCEPTIONS.md") {
      return {
        pass: false,
        message: `exception ${name} must reference docs/engineering/MIGRATION_HISTORY_EXCEPTIONS.md`,
      };
    }

    const sqlPath = join(migrationsDir, name, "migration.sql");
    if (!existsSync(sqlPath)) {
      return { pass: false, message: `excepted migration.sql missing on disk: ${name}` };
    }

    const actual = sha256File(sqlPath);
    if (actual !== expected) {
      return {
        pass: false,
        message:
          `migration ${name} was edited without updating the checksum manifest ` +
          `(expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…)`,
      };
    }
  }

  return { pass: true, exceptionCount: manifest.exceptions.length };
}

/**
 * Accept a legacy _prisma_migrations checksum only when documented and repo file matches manifest.
 */
export function classifyLegacyMigrationChecksum(
  migrationName,
  repoFileSha256,
  appliedChecksum,
  options = {},
) {
  const exceptionsPath = options.exceptionsPath ?? DEFAULT_EXCEPTIONS_PATH;
  let manifest;
  try {
    manifest = loadMigrationChecksumExceptions(exceptionsPath);
  } catch {
    return { accepted: false, reason: "MANIFEST_UNAVAILABLE" };
  }

  const entry = manifest.exceptions.find((e) => e.migration === migrationName);
  if (!entry) {
    return { accepted: false, reason: "NOT_DOCUMENTED" };
  }
  if (entry.repoSha256 !== repoFileSha256) {
    return { accepted: false, reason: "REPO_MANIFEST_MISMATCH" };
  }
  if (appliedChecksum === repoFileSha256) {
    return { accepted: true, reason: "MATCHES_REPO" };
  }
  return {
    accepted: true,
    reason: "DOCUMENTED_HISTORICAL_EXCEPTION",
    classification: entry.classification ?? "ACCEPTED_HISTORICAL_APPLIED_MIGRATION_EDIT",
  };
}
