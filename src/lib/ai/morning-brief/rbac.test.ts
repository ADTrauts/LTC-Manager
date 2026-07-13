import assert from "node:assert/strict";
import test from "node:test";

import { hasAtLeastRole } from "@/lib/access";
import { isAiBriefEnabled } from "@/lib/feature-flags";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test("Morning Brief refresh requires Manager+", () => {
  assert.equal(hasAtLeastRole("MANAGER", "MANAGER"), true);
  assert.equal(hasAtLeastRole("GM", "MANAGER"), true);
  assert.equal(hasAtLeastRole("FACILITY_ADMINISTRATOR", "MANAGER"), true);
  assert.equal(hasAtLeastRole("SUPERVISOR", "MANAGER"), false);
  assert.equal(hasAtLeastRole("STAFF", "MANAGER"), false);
  assert.equal(hasAtLeastRole("LEAD_TEAM_MEMBER", "MANAGER"), false);
});

test("AI brief flag off means Operations Center should skip AI UI", () => {
  withEnv("AI_BRIEF_ENABLED", "false", () => {
    assert.equal(isAiBriefEnabled(), false);
  });
  withEnv("AI_BRIEF_ENABLED", undefined, () => {
    assert.equal(isAiBriefEnabled(), false);
  });
});
