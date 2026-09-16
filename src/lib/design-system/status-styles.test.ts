import assert from "node:assert/strict";
import test from "node:test";

import {
  isQuietZeroMetricValue,
  metricQuietZeroClasses,
  statusBadgeClass,
  statusSurfaceClass,
  statusValueClass,
} from "@/lib/design-system/status-styles";

test("statusBadgeClass mirrors readiness chip colors", () => {
  assert.match(statusBadgeClass("ready"), /emerald/);
  assert.match(statusBadgeClass("in_progress"), /amber/);
  assert.match(statusBadgeClass("blocked"), /red/);
});

test("statusBadgeClass quiet ready is muted (presentation only)", () => {
  assert.match(statusBadgeClass("ready", "quiet"), /text-zinc-500/);
  assert.doesNotMatch(statusBadgeClass("ready", "quiet"), /bg-emerald/);
  // Exceptions stay loud even if quiet prominence is requested for ready-only callers.
  assert.match(statusBadgeClass("blocked", "quiet"), /red/);
});

test("statusSurfaceClass maps operational tones", () => {
  assert.match(statusSurfaceClass("success"), /emerald/);
  assert.match(statusSurfaceClass("neutral"), /zinc/);
  assert.equal(statusSurfaceClass("default"), "border-zinc-200 bg-white");
});

test("statusValueClass emphasizes metric values per tone", () => {
  assert.match(statusValueClass("blocked"), /red/);
  assert.match(statusValueClass("default"), /zinc-900/);
});

test("quiet zero metric helpers", () => {
  assert.equal(isQuietZeroMetricValue(0), true);
  assert.equal(isQuietZeroMetricValue("0"), true);
  assert.equal(isQuietZeroMetricValue(2), false);
  const muted = metricQuietZeroClasses("blocked");
  assert.ok(muted);
  assert.match(muted.surface, /bg-white/);
  assert.equal(metricQuietZeroClasses("default"), null);
});
