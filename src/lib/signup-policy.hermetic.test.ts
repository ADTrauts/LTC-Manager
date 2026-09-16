import assert from "node:assert/strict";
import test from "node:test";

import { isPublicSignupEnabled } from "./signup-policy";

test("public signup is disabled by default in production", () => {
  assert.equal(isPublicSignupEnabled({ NODE_ENV: "production" }), false);
});

test("public signup remains available by default for local development", () => {
  assert.equal(isPublicSignupEnabled({ NODE_ENV: "development" }), true);
  assert.equal(isPublicSignupEnabled({ NODE_ENV: "test" }), true);
});

test("public signup requires an explicit true value when configured", () => {
  assert.equal(
    isPublicSignupEnabled({ NODE_ENV: "production", PUBLIC_SIGNUP_ENABLED: "true" }),
    true,
  );
  assert.equal(
    isPublicSignupEnabled({ NODE_ENV: "development", PUBLIC_SIGNUP_ENABLED: "false" }),
    false,
  );
});
