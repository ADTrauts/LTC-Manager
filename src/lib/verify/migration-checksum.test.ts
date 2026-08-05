import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const EXCEPTIONS_PATH = join(REPO_ROOT, "scripts/verify/migration-checksum-exceptions.json");
const DOCS_PATH = join(REPO_ROOT, "docs/engineering/MIGRATION_HISTORY_EXCEPTIONS.md");
const HISTORICAL_SQL = join(
  REPO_ROOT,
  "prisma/migrations/20260423105656/migration.sql",
);
const CHECKSUM_MODULE = join(REPO_ROOT, "scripts/verify/lib/migration-checksum.mjs");

async function loadChecksumModule() {
  return import(CHECKSUM_MODULE);
}

test("sha256Hex matches known migration file contents", async () => {
  const { sha256Hex } = await loadChecksumModule();
  const content = readFileSync(HISTORICAL_SQL, "utf8");
  const expected = createHash("sha256").update(content, "utf8").digest("hex");
  assert.equal(sha256Hex(content), expected);
});

test("verifyRepoMigrationChecksums accepts the committed manifest and docs", async () => {
  const { verifyRepoMigrationChecksums } = await loadChecksumModule();
  const result = verifyRepoMigrationChecksums({
    migrationsDir: join(REPO_ROOT, "prisma/migrations"),
    exceptionsPath: EXCEPTIONS_PATH,
    docsPath: DOCS_PATH,
  });
  assert.equal(result.pass, true);
  assert.equal(result.exceptionCount, 1);
});

test("verifyRepoMigrationChecksums fails when an excepted migration drifts without manifest update", async () => {
  const { verifyRepoMigrationChecksums } = await loadChecksumModule();
  const tempRoot = mkdtempSync(join(tmpdir(), "ltc-migration-checksum-"));
  const migrationsDir = join(tempRoot, "prisma/migrations/20260423105656");
  mkdirSync(migrationsDir, { recursive: true });
  writeFileSync(join(migrationsDir, "migration.sql"), "-- edited without manifest update\n");

  const exceptionsPath = join(tempRoot, "exceptions.json");
  writeFileSync(
    exceptionsPath,
    JSON.stringify({
      version: 1,
      exceptions: [
        {
          migration: "20260423105656",
          repoSha256: "c94c71258d91d8d4eb14c3d3aca09886fdb54ff8b46b0ffc88c9cf43fa039555",
          documentedIn: "docs/engineering/MIGRATION_HISTORY_EXCEPTIONS.md",
          classification: "ACCEPTED_HISTORICAL_APPLIED_MIGRATION_EDIT",
        },
      ],
    }),
  );

  const docsPath = join(tempRoot, "MIGRATION_HISTORY_EXCEPTIONS.md");
  writeFileSync(docsPath, "# exceptions\n");

  const result = verifyRepoMigrationChecksums({
    migrationsDir: join(tempRoot, "prisma/migrations"),
    exceptionsPath,
    docsPath,
  });
  assert.equal(result.pass, false);
  assert.match(result.message ?? "", /without updating the checksum manifest/i);
});

test("classifyLegacyMigrationChecksum accepts documented historical checksum drift", async () => {
  const { classifyLegacyMigrationChecksum } = await loadChecksumModule();
  const repoSha = "c94c71258d91d8d4eb14c3d3aca09886fdb54ff8b46b0ffc88c9cf43fa039555";
  const legacyApplied = "deadbeef".repeat(8);
  const decision = classifyLegacyMigrationChecksum(
    "20260423105656",
    repoSha,
    legacyApplied,
    { exceptionsPath: EXCEPTIONS_PATH },
  );
  assert.equal(decision.accepted, true);
  assert.equal(decision.reason, "DOCUMENTED_HISTORICAL_EXCEPTION");
});

test("classifyLegacyMigrationChecksum rejects undocumented migrations", async () => {
  const { classifyLegacyMigrationChecksum } = await loadChecksumModule();
  const decision = classifyLegacyMigrationChecksum(
    "20990101010101_unknown",
    "a".repeat(64),
    "b".repeat(64),
    { exceptionsPath: EXCEPTIONS_PATH },
  );
  assert.equal(decision.accepted, false);
  assert.equal(decision.reason, "NOT_DOCUMENTED");
});

test("verifyRepoMigrationChecksums fails when exception documentation is missing", async () => {
  const { verifyRepoMigrationChecksums } = await loadChecksumModule();
  const tempRoot = mkdtempSync(join(tmpdir(), "ltc-migration-docs-"));
  const result = verifyRepoMigrationChecksums({
    migrationsDir: join(REPO_ROOT, "prisma/migrations"),
    exceptionsPath: EXCEPTIONS_PATH,
    docsPath: join(tempRoot, "MISSING.md"),
  });
  assert.equal(result.pass, false);
  assert.match(result.message ?? "", /missing required documentation/i);
});
