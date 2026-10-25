/**
 * Dashboard location summary is one Runtime Location State batch.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const loadSrc = readFileSync(join(process.cwd(), "src/lib/dashboard/runtime/load.ts"), "utf8");

test("Dashboard operational truth is one Runtime Location State batch", () => {
  assert.match(loadSrc, /collectActionableLandingSpaces/);
  assert.match(loadSrc, /loadRuntimeLocationStates\(/);
  assert.equal((loadSrc.match(/loadRuntimeLocationStates\(/g) ?? []).length, 1);
  assert.equal(loadSrc.includes("loadDashboardQueries"), false);
  assert.equal(loadSrc.includes("computeReadinessBatch"), false);
  assert.equal(loadSrc.includes("ScheduleEntry"), false);
  assert.equal(loadSrc.includes("LogAssignment"), false);
});
