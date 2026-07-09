import assert from "node:assert/strict";
import test from "node:test";

import { isTodaysWorkEnabled } from "@/lib/feature-flags";
import { resolveDefaultHomePath } from "@/lib/nav-zones";

function withEnv(name: string, value: string | undefined, fn: () => void) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

test("isTodaysWorkEnabled defaults to true when unset", () => {
  withEnv("TODAYS_WORK_ENABLED", undefined, () => {
    assert.equal(isTodaysWorkEnabled(), true);
  });
});

test("isTodaysWorkEnabled parses falsey env values", () => {
  for (const value of ["false", "0", "off", "no"]) {
    withEnv("TODAYS_WORK_ENABLED", value, () => {
      assert.equal(isTodaysWorkEnabled(), false, value);
    });
  }
});

test("resolveDefaultHomePath falls back to Operations Center when Today's Work is disabled", () => {
  withEnv("TODAYS_WORK_ENABLED", "false", () => {
    assert.equal(resolveDefaultHomePath({ authKind: "user", role: "SUPERVISOR" }), "/dashboard");
  });
});
