import assert from "node:assert/strict";
import test from "node:test";

import { buildSitePulseFromReadinessSummary } from "@/lib/readiness/build-site-pulse";

test("buildSitePulseFromReadinessSummary prioritizes blocked locations", () => {
  const pulse = buildSitePulseFromReadinessSummary({
    total: 3,
    ready: 1,
    inProgress: 1,
    blocked: 1,
  });

  assert.equal(pulse.tone, "blocked");
  assert.match(pulse.headline, /Blocked/);
  assert.equal(pulse.locationSummary, "1 ready · 1 in progress · 1 blocked");
});

test("buildSitePulseFromReadinessSummary handles empty facilities calmly", () => {
  const pulse = buildSitePulseFromReadinessSummary({
    total: 0,
    ready: 0,
    inProgress: 0,
    blocked: 0,
  });

  assert.equal(pulse.tone, "neutral");
  assert.match(pulse.headline, /No active locations/i);
});
