/**
 * Create/drop disposable verification databases without requiring postgresql-client (psql).
 *
 * Uses `prisma db execute --stdin` against an admin URL (maintenance database `postgres`).
 * Avoids Prisma Client `$executeRawUnsafe`, which can wrap DDL in a transaction that PostgreSQL
 * rejects for CREATE/DROP DATABASE.
 */
import { spawnSync } from "node:child_process";
import { parseDatabaseName, redactDatabaseUrl } from "./lib/database-target.mjs";

function sanitizeError(message) {
  return String(message || "unknown").replace(/:[^@\s/]+@/g, ":***@");
}

export async function assertPostgresAdminUrl(adminUrl) {
  const name = parseDatabaseName(adminUrl);
  if (!name) {
    throw new Error("admin URL could not be parsed");
  }
  if (name !== "postgres") {
    throw new Error("admin URL must target the postgres maintenance database");
  }
}

/**
 * Run a single SQL statement against the admin URL via Prisma CLI (no psql).
 */
export async function runAdminSql(adminUrl, sql, label) {
  await assertPostgresAdminUrl(adminUrl);
  const result = spawnSync(
    "npx",
    ["prisma", "db", "execute", "--url", adminUrl, "--stdin"],
    {
      input: sql.endsWith(";") ? sql : `${sql};`,
      encoding: "utf8",
      env: process.env,
    },
  );
  if (result.status !== 0) {
    const detail = sanitizeError(result.stderr || result.stdout || "unknown");
    throw new Error(
      `${label} failed against ${redactDatabaseUrl(adminUrl)}: ${detail}`,
    );
  }
}

export async function recreateDisposableDatabase(adminUrl, databaseName) {
  await assertPostgresAdminUrl(adminUrl);
  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error("database name contains unsupported characters");
  }
  // Match dropDisposableDatabase: browsers/next start can leave sessions open.
  await runAdminSql(
    adminUrl,
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${databaseName}' AND pid <> pg_backend_pid()`,
    "terminate database sessions",
  );
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await runAdminSql(adminUrl, `DROP DATABASE IF EXISTS "${databaseName}"`, "drop database");
      await runAdminSql(adminUrl, `CREATE DATABASE "${databaseName}"`, "create database");
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      await runAdminSql(
        adminUrl,
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${databaseName}' AND pid <> pg_backend_pid()`,
        "terminate database sessions",
      ).catch(() => {});
    }
  }
  throw lastError;
}

export async function dropDisposableDatabase(adminUrl, databaseName) {
  await assertPostgresAdminUrl(adminUrl);
  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error("database name contains unsupported characters");
  }
  // CI browsers and next start can leave sessions open briefly after SIGTERM.
  await runAdminSql(
    adminUrl,
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${databaseName}' AND pid <> pg_backend_pid()`,
    "terminate database sessions",
  );
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await runAdminSql(adminUrl, `DROP DATABASE IF EXISTS "${databaseName}"`, "drop database");
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      await runAdminSql(
        adminUrl,
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${databaseName}' AND pid <> pg_backend_pid()`,
        "terminate database sessions",
      ).catch(() => {});
    }
  }
  throw lastError;
}
