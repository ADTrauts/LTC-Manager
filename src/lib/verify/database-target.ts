/**
 * Shared database-target safety for verification, SQL-backed tests, and maintenance.
 *
 * Verification must never touch the developer's local `ltc_manager` database. Callers supply an
 * explicit disposable URL; this module parses the database name and rejects unsafe targets before
 * any Prisma command or test runner opens a connection.
 *
 * Errors never include the password or the full connection string.
 */

export type DatabaseTargetDecision =
  | { ok: true; databaseName: string; host: string }
  | { ok: false; reason: DatabaseTargetRejection };

export type DatabaseTargetRejection =
  | "URL_MISSING"
  | "URL_MALFORMED"
  | "DATABASE_NAME_MISSING"
  | "DATABASE_NAME_FORBIDDEN"
  | "DATABASE_NAME_NOT_DISPOSABLE";

/** Exact names that must never receive verification or destructive test traffic. */
export const FORBIDDEN_DATABASE_NAMES = new Set(["ltc_manager"]);

/**
 * Disposable names allowed for migrate/seed/SQL-backed tests and CI.
 *
 * Prefixes are matched against the database name only (not the full URL), so a password containing
 * one of these strings cannot open an otherwise-forbidden database.
 */
export const DISPOSABLE_DATABASE_PREFIXES = ["ltc_verify_", "ltc_test_", "ltc_ci_"] as const;

const REDACTED = "[redacted]";

/**
 * Strip credentials from a URL for error messages and logs.
 * Returns a host/path summary or a generic placeholder when parsing fails.
 */
export function redactDatabaseUrl(url: string | undefined | null): string {
  if (!url) return REDACTED;
  try {
    const parsed = new URL(url);
    const db = parsed.pathname.replace(/^\//, "").split("?")[0] || "(none)";
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}/${db}`;
  } catch {
    return REDACTED;
  }
}

/**
 * Extract the PostgreSQL database name from a connection URL.
 *
 * Uses the URL pathname (first segment), ignoring query parameters such as `?schema=public`.
 * Does not treat a username, password, or host fragment that happens to contain "ltc_" as a name.
 */
export function parseDatabaseName(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!parsed.protocol.startsWith("postgres")) {
    return null;
  }
  const path = parsed.pathname.replace(/^\//, "");
  if (!path) return null;
  // Path may be "dbname" or rarely "dbname/extra"; take the first segment only.
  const name = path.split("/")[0]?.split("?")[0] ?? "";
  if (!name) return null;
  // Percent-decode so encoded names still match policy.
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export function isDisposableDatabaseName(name: string): boolean {
  if (FORBIDDEN_DATABASE_NAMES.has(name)) return false;
  return DISPOSABLE_DATABASE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Decide whether a connection URL may be used for verification or SQL-backed tests.
 *
 * Does not open a connection. Callers that create/destroy databases should still pass the
 * resulting name through this check before issuing DDL.
 */
export function evaluateDatabaseTarget(url: string | undefined | null): DatabaseTargetDecision {
  if (url == null || String(url).trim() === "") {
    return { ok: false, reason: "URL_MISSING" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "URL_MALFORMED" };
  }

  if (!parsed.protocol.startsWith("postgres")) {
    return { ok: false, reason: "URL_MALFORMED" };
  }

  const databaseName = parseDatabaseName(url);
  if (!databaseName) {
    return { ok: false, reason: "DATABASE_NAME_MISSING" };
  }

  if (FORBIDDEN_DATABASE_NAMES.has(databaseName)) {
    return { ok: false, reason: "DATABASE_NAME_FORBIDDEN" };
  }

  if (!isDisposableDatabaseName(databaseName)) {
    return { ok: false, reason: "DATABASE_NAME_NOT_DISPOSABLE" };
  }

  const host = parsed.hostname || "(unknown)";
  return { ok: true, databaseName, host };
}

/** Human-readable rejection without credentials. */
export function describeDatabaseTargetRejection(reason: DatabaseTargetRejection): string {
  switch (reason) {
    case "URL_MISSING":
      return "A disposable database URL is required.";
    case "URL_MALFORMED":
      return "The database URL could not be parsed safely.";
    case "DATABASE_NAME_MISSING":
      return "The database URL does not name a database.";
    case "DATABASE_NAME_FORBIDDEN":
      return "The database name ltc_manager is forbidden for verification and tests.";
    case "DATABASE_NAME_NOT_DISPOSABLE":
      return `The database name is not disposable. Allowed prefixes: ${DISPOSABLE_DATABASE_PREFIXES.join(", ")}.`;
  }
}

/**
 * Assert the URL is a safe disposable target. Throws an Error whose message never includes
 * credentials or the full URL.
 */
export function assertDisposableDatabaseUrl(url: string | undefined | null): {
  databaseName: string;
  host: string;
} {
  const decision = evaluateDatabaseTarget(url);
  if (!decision.ok) {
    throw new Error(describeDatabaseTargetRejection(decision.reason));
  }
  return { databaseName: decision.databaseName, host: decision.host };
}

/**
 * Env vars that opt SQL-backed suites into a real database.
 * When any is set for test:db, all must point at the same disposable database (or be unset and
 * receive the shared VERIFY_DATABASE_URL).
 */
export const SQL_BACKED_DATABASE_ENV_KEYS = [
  "AUTH_RATE_LIMIT_TEST_DATABASE_URL",
  "SERVERY_MILESTONE_TEST_DATABASE_URL",
  "SESSION_REVOCATION_TEST_DATABASE_URL",
  "OBJECT_SCOPE_TEST_DATABASE_URL",
  "OFFLINE_RUNTIME_TEST_DATABASE_URL",
  "ASSIGNMENT_TEST_DATABASE_URL",
] as const;
