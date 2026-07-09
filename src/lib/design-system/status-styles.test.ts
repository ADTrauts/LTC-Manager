import assert from "node:assert/strict";
import test from "node:test";

import {
  statusBadgeClass,
  statusSurfaceClass,
  statusValueClass,
} from "@/lib/design-system/status-styles";

test("statusBadgeClass mirrors readiness chip colors", () => {
  assert.match(statusBadgeClass("ready"), /emerald/);
  assert.match(statusBadgeClass("in_progress"), /amber/);
  assert.match(statusBadgeClass("blocked"), /red/);
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
