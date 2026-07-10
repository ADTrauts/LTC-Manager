import assert from "node:assert/strict";
import test from "node:test";

import { readinessStateLabel } from "@/components/readiness-chip";
import { statusBadgeLabel } from "@/lib/design-system/status-styles";
import { readinessStateDisplayLabel } from "@/lib/readiness";
import { walkListStatusLabel } from "@/components/todays-work/walk-list-status";

test("internal blocked state displays as Needs Attention on readiness surfaces", () => {
  assert.equal(readinessStateLabel("blocked"), "Needs Attention");
  assert.equal(readinessStateDisplayLabel("blocked"), "Needs Attention");
  assert.equal(statusBadgeLabel("blocked"), "Needs Attention");
  assert.equal(walkListStatusLabel("blocked"), "Needs Attention");
});

test("ready and in-progress labels stay certified", () => {
  assert.equal(readinessStateLabel("ready"), "Ready");
  assert.equal(readinessStateLabel("in_progress"), "In Progress");
  assert.equal(statusBadgeLabel("in_progress"), "In Progress");
});
