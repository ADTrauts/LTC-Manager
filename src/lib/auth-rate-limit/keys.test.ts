import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAccountIdentifier,
  passwordAccountBucketKey,
  pinCandidateBucketKey,
  pinFacilityBucketKey,
} from "@/lib/auth-rate-limit/keys";

// Read inside each helper, so setting it after the import is sufficient.
process.env.AUTH_SECRET ??= "auth-rate-limit-key-test-secret";

const EMAIL = "Grace.Hopper@Example.COM";
const PIN = "402517";
const FACILITY_A = "facility_aaa";
const FACILITY_B = "facility_bbb";

test("account identifiers normalize case and surrounding whitespace", () => {
  assert.equal(normalizeAccountIdentifier("  Grace.Hopper@Example.COM "), "grace.hopper@example.com");
  assert.equal(
    passwordAccountBucketKey("  Grace.Hopper@Example.COM "),
    passwordAccountBucketKey("grace.hopper@example.com"),
  );
});

test("account bucket keys do not contain the email address", () => {
  const key = passwordAccountBucketKey(EMAIL);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.ok(!key.includes("grace"));
  assert.ok(!key.includes("hopper"));
  assert.ok(!key.includes("example.com"));
  assert.ok(!key.toLowerCase().includes(EMAIL.toLowerCase()));
});

test("PIN candidate bucket keys do not contain the PIN", () => {
  const key = pinCandidateBucketKey(FACILITY_A, PIN);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.ok(!key.includes(PIN));
  assert.ok(!key.includes(FACILITY_A));
});

test("distinct inputs produce distinct buckets", () => {
  assert.notEqual(pinCandidateBucketKey(FACILITY_A, PIN), pinCandidateBucketKey(FACILITY_A, "402518"));
  assert.notEqual(pinCandidateBucketKey(FACILITY_A, PIN), pinCandidateBucketKey(FACILITY_B, PIN));
  assert.notEqual(pinFacilityBucketKey(FACILITY_A), pinFacilityBucketKey(FACILITY_B));
  assert.notEqual(
    passwordAccountBucketKey("a@example.com"),
    passwordAccountBucketKey("b@example.com"),
  );
});

test("bucket types are namespaced so identical material cannot collide across purposes", () => {
  assert.notEqual(pinFacilityBucketKey(FACILITY_A), passwordAccountBucketKey(FACILITY_A));
});

test("keys are stable for the same input", () => {
  assert.equal(pinCandidateBucketKey(FACILITY_A, PIN), pinCandidateBucketKey(FACILITY_A, PIN));
  assert.equal(passwordAccountBucketKey(EMAIL), passwordAccountBucketKey(EMAIL));
});
