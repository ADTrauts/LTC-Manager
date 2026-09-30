import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmailVerificationUrl,
  hashEmailVerificationToken,
  mintEmailVerificationToken,
} from "./tokens";

test("minted verification tokens hash stably and are URL-safe", () => {
  const minted = mintEmailVerificationToken();
  assert.equal(hashEmailVerificationToken(minted.rawToken), minted.tokenHash);
  assert.match(minted.rawToken, /^[A-Za-z0-9_-]+$/);
  assert.ok(minted.expiresAt.getTime() > Date.now());
});

test("verification URL carries the raw token as a query param", () => {
  const url = buildEmailVerificationUrl("https://vssyl.com", "abc_token-1");
  assert.equal(url, "https://vssyl.com/verify-email?token=abc_token-1");
});
