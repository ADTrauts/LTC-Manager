import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  ACCOUNT_ACTIVATION_GRACE_MS,
  ACCOUNT_ACTIVATION_REQUIRED_MESSAGE,
  pinActivationDenied,
} from "@/lib/employee-identity";

const pin = readFileSync(join(process.cwd(), "src/app/api/auth/pin-login/route.ts"), "utf8");

const createdAt = new Date("2026-01-01T00:00:00.000Z");
const pending = {
  isActive: true,
  passwordHash: null,
  emailVerifiedAt: null,
  createdAt,
};

test("correct PIN + pending User is allowed on day 1 and day 29", () => {
  assert.equal(
    pinActivationDenied("user_1", pending, new Date(createdAt.getTime() + 24 * 60 * 60 * 1000)),
    false,
  );
  assert.equal(
    pinActivationDenied("user_1", pending, new Date(createdAt.getTime() + 29 * 24 * 60 * 60 * 1000)),
    false,
  );
});

test("correct PIN + pending User after 30 days is denied without counting as a guess", () => {
  assert.equal(
    pinActivationDenied(
      "user_1",
      pending,
      new Date(createdAt.getTime() + ACCOUNT_ACTIVATION_GRACE_MS + 1),
    ),
    true,
  );
  assert.equal(ACCOUNT_ACTIVATION_REQUIRED_MESSAGE, "Account activation required");
  const denyBlock = pin.slice(pin.indexOf("if (pinActivationDenied"), pin.indexOf("createSessionToken({"));
  assert.match(denyBlock, /status: 403/);
  assert.doesNotMatch(denyBlock, /registerAuthFailure/);
  assert.match(pin, /GENERIC_PIN_FAILURE = "Invalid PIN\."/);
});

test("wrong PIN still uses Invalid PIN and records a guess before activation policy", () => {
  assert.ok(pin.indexOf("if (!employee)") < pin.indexOf("if (pinActivationDenied"));
  const miss = pin.slice(pin.indexOf("if (!employee)"), pin.indexOf("if (pinActivationDenied"));
  assert.match(miss, /registerAuthFailure/);
  assert.match(miss, /GENERIC_PIN_FAILURE/);
});

test("historical unlinked Employees skip the activation gate", () => {
  assert.equal(pinActivationDenied(null, null), false);
  assert.match(pin, /if \(employee\.userId\)/);
  assert.match(pin, /uid: employee\.id/);
});
