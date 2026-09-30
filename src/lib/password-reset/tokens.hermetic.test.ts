import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPasswordResetUrl,
  hashPasswordResetToken,
  mintPasswordResetToken,
} from "./tokens";

test("minted reset tokens hash stably and are URL-safe", () => {
  const minted = mintPasswordResetToken();
  assert.equal(hashPasswordResetToken(minted.rawToken), minted.tokenHash);
  assert.match(minted.rawToken, /^[A-Za-z0-9_-]+$/);
  assert.ok(minted.expiresAt.getTime() > Date.now());
});

test("reset URL carries the raw token as a query param", () => {
  const url = buildPasswordResetUrl("https://vssyl.com", "abc_token-1");
  assert.equal(url, "https://vssyl.com/reset-password?token=abc_token-1");
});
