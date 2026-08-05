import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDisposableDatabaseUrl,
  describeDatabaseTargetRejection,
  evaluateDatabaseTarget,
  parseDatabaseName,
  redactDatabaseUrl,
} from "./database-target";

const SECRET = "s3cret-should-never-appear";

function url(db: string, extra = ""): string {
  return `postgresql://ltc_admin:${SECRET}@127.0.0.1:5432/${db}${extra}`;
}

test("ltc_manager is rejected as forbidden", () => {
  const decision = evaluateDatabaseTarget(url("ltc_manager"));
  assert.equal(decision.ok, false);
  assert.equal(decision.ok === false && decision.reason, "DATABASE_NAME_FORBIDDEN");
});

test("missing URL is rejected", () => {
  assert.equal(evaluateDatabaseTarget(undefined).ok, false);
  assert.equal(evaluateDatabaseTarget("").ok, false);
  assert.equal(evaluateDatabaseTarget("   ").ok, false);
});

test("malformed URL is rejected", () => {
  const decision = evaluateDatabaseTarget("not-a-url");
  assert.equal(decision.ok, false);
  assert.equal(decision.ok === false && decision.reason, "URL_MALFORMED");
});

test("non-postgres protocol is rejected as malformed", () => {
  const decision = evaluateDatabaseTarget(`mysql://u:${SECRET}@127.0.0.1:3306/ltc_verify_x`);
  assert.equal(decision.ok, false);
  assert.equal(decision.ok === false && decision.reason, "URL_MALFORMED");
});

test("approved disposable prefixes are accepted", () => {
  for (const name of ["ltc_verify_ci", "ltc_test_phase5", "ltc_ci_123"]) {
    const decision = evaluateDatabaseTarget(url(name, "?schema=public"));
    assert.equal(decision.ok, true, name);
    assert.equal(decision.ok === true && decision.databaseName, name);
  }
});

test("query parameters do not break database-name parsing", () => {
  assert.equal(parseDatabaseName(url("ltc_verify_x", "?schema=public&connection_limit=5")), "ltc_verify_x");
});

test("similar but unsafe names are rejected", () => {
  for (const name of [
    "ltc_manager_backup",
    "ltc_verify", // missing trailing underscore + suffix — wait, "ltc_verify" doesn't start with "ltc_verify_"
    "my_ltc_verify_x",
    "ltc_prod",
    "postgres",
    "ltc_p5_baseline", // historical Phase names without approved prefix
  ]) {
    const decision = evaluateDatabaseTarget(url(name));
    assert.equal(decision.ok, false, `${name} should be rejected`);
  }
});

test("a password containing an allowed prefix cannot authorize a forbidden database", () => {
  // Password literally contains ltc_verify_ — policy must still read the path name.
  const sneaky = `postgresql://ltc_admin:ltc_verify_fake@127.0.0.1:5432/ltc_manager?schema=public`;
  const decision = evaluateDatabaseTarget(sneaky);
  assert.equal(decision.ok, false);
  assert.equal(decision.ok === false && decision.reason, "DATABASE_NAME_FORBIDDEN");
});

test("credentials never appear in redaction or rejection text", () => {
  const redacted = redactDatabaseUrl(url("ltc_manager"));
  assert.doesNotMatch(redacted, new RegExp(SECRET));
  assert.doesNotMatch(redacted, /ltc_admin/);

  for (const reason of [
    "URL_MISSING",
    "URL_MALFORMED",
    "DATABASE_NAME_MISSING",
    "DATABASE_NAME_FORBIDDEN",
    "DATABASE_NAME_NOT_DISPOSABLE",
  ] as const) {
    const text = describeDatabaseTargetRejection(reason);
    assert.doesNotMatch(text, new RegExp(SECRET));
    assert.doesNotMatch(text, /postgresql:\/\//i);
  }

  assert.throws(
    () => assertDisposableDatabaseUrl(url("ltc_manager")),
    (err: Error) => {
      assert.doesNotMatch(err.message, new RegExp(SECRET));
      assert.doesNotMatch(err.message, /postgresql:\/\//i);
      return true;
    },
  );
});

test("assertDisposableDatabaseUrl returns name and host for a valid target", () => {
  const result = assertDisposableDatabaseUrl(url("ltc_ci_runner"));
  assert.equal(result.databaseName, "ltc_ci_runner");
  assert.equal(result.host, "127.0.0.1");
});

test("empty database path is rejected", () => {
  const decision = evaluateDatabaseTarget(`postgresql://ltc_admin:${SECRET}@127.0.0.1:5432/`);
  assert.equal(decision.ok, false);
  assert.equal(decision.ok === false && decision.reason, "DATABASE_NAME_MISSING");
});
