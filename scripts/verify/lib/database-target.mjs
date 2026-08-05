/**
 * Script-side copy of src/lib/verify/database-target.ts for plain Node runners.
 * Keep behavior in sync with the TypeScript module — unit tests cover the TS source.
 */

export const FORBIDDEN_DATABASE_NAMES = new Set(["ltc_manager"]);
export const DISPOSABLE_DATABASE_PREFIXES = ["ltc_verify_", "ltc_test_", "ltc_ci_"];

export const SQL_BACKED_DATABASE_ENV_KEYS = [
  "AUTH_RATE_LIMIT_TEST_DATABASE_URL",
  "SERVERY_MILESTONE_TEST_DATABASE_URL",
  "SESSION_REVOCATION_TEST_DATABASE_URL",
  "OBJECT_SCOPE_TEST_DATABASE_URL",
  "OFFLINE_RUNTIME_TEST_DATABASE_URL",
  "ASSIGNMENT_TEST_DATABASE_URL",
];

const REDACTED = "[redacted]";

export function redactDatabaseUrl(url) {
  if (!url) return REDACTED;
  try {
    const parsed = new URL(url);
    const db = parsed.pathname.replace(/^\//, "").split("?")[0] || "(none)";
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}/${db}`;
  } catch {
    return REDACTED;
  }
}

export function parseDatabaseName(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!parsed.protocol.startsWith("postgres")) return null;
  const path = parsed.pathname.replace(/^\//, "");
  if (!path) return null;
  const name = path.split("/")[0]?.split("?")[0] ?? "";
  if (!name) return null;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export function isDisposableDatabaseName(name) {
  if (FORBIDDEN_DATABASE_NAMES.has(name)) return false;
  return DISPOSABLE_DATABASE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function evaluateDatabaseTarget(url) {
  if (url == null || String(url).trim() === "") {
    return { ok: false, reason: "URL_MISSING" };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "URL_MALFORMED" };
  }
  if (!parsed.protocol.startsWith("postgres")) {
    return { ok: false, reason: "URL_MALFORMED" };
  }
  const databaseName = parseDatabaseName(url);
  if (!databaseName) return { ok: false, reason: "DATABASE_NAME_MISSING" };
  if (FORBIDDEN_DATABASE_NAMES.has(databaseName)) {
    return { ok: false, reason: "DATABASE_NAME_FORBIDDEN" };
  }
  if (!isDisposableDatabaseName(databaseName)) {
    return { ok: false, reason: "DATABASE_NAME_NOT_DISPOSABLE" };
  }
  return { ok: true, databaseName, host: parsed.hostname || "(unknown)" };
}

export function describeDatabaseTargetRejection(reason) {
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
    default:
      return "The database target was rejected.";
  }
}

export function assertDisposableDatabaseUrl(url) {
  const decision = evaluateDatabaseTarget(url);
  if (!decision.ok) {
    throw new Error(describeDatabaseTargetRejection(decision.reason));
  }
  return { databaseName: decision.databaseName, host: decision.host };
}
