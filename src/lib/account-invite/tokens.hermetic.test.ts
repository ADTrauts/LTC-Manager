import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountInviteUrl,
  hashAccountInviteToken,
  mintAccountInviteToken,
} from "./tokens";

test("minted invite tokens hash stably and are URL-safe", () => {
  const minted = mintAccountInviteToken();
  assert.equal(hashAccountInviteToken(minted.rawToken), minted.tokenHash);
  assert.match(minted.rawToken, /^[A-Za-z0-9_-]+$/);
  assert.ok(minted.expiresAt.getTime() > Date.now());
});

test("invite URL carries the raw token as a query param", () => {
  const url = buildAccountInviteUrl("https://vssyl.com", "abc_token-1");
  assert.equal(url, "https://vssyl.com/accept-invite?token=abc_token-1");
});
