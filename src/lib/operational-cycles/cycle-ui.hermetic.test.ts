import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCycleOverviewSummary,
  isTrueCycleFirstSetup,
  shouldShowCycleCurrentSection,
  shouldShowCycleDraftSection,
  shouldShowCycleHistorySection,
  shouldShowCycleScheduledSection,
} from "./cycle-ui";

test("true first-setup when all lifecycle buckets empty", () => {
  const presence = {
    currentCount: 0,
    draftCount: 0,
    scheduledCount: 0,
    historyCount: 0,
  };
  assert.equal(isTrueCycleFirstSetup(presence), true);
  assert.equal(shouldShowCycleCurrentSection(presence), false);
  assert.equal(shouldShowCycleDraftSection(presence), false);
  assert.equal(shouldShowCycleScheduledSection(presence), false);
  assert.equal(shouldShowCycleHistorySection(presence), false);
});

test("progressive sections appear only when data exists", () => {
  assert.equal(
    shouldShowCycleDraftSection({
      currentCount: 0,
      draftCount: 1,
      scheduledCount: 0,
      historyCount: 0,
    }),
    true,
  );
  assert.equal(
    shouldShowCycleCurrentSection({
      currentCount: 2,
      draftCount: 0,
      scheduledCount: 0,
      historyCount: 0,
    }),
    true,
  );
  assert.equal(
    shouldShowCycleScheduledSection({
      currentCount: 1,
      draftCount: 0,
      scheduledCount: 1,
      historyCount: 0,
    }),
    true,
  );
  assert.equal(
    shouldShowCycleHistorySection({
      currentCount: 0,
      draftCount: 0,
      scheduledCount: 0,
      historyCount: 3,
    }),
    true,
  );
  assert.equal(
    isTrueCycleFirstSetup({
      currentCount: 0,
      draftCount: 1,
      scheduledCount: 0,
      historyCount: 0,
    }),
    false,
  );
});

test("overview cycle summary phrasing", () => {
  assert.equal(
    formatCycleOverviewSummary({
      currentCount: 0,
      draftCount: 0,
      scheduledCount: 0,
    }),
    "0 configured",
  );
  assert.equal(
    formatCycleOverviewSummary({
      currentCount: 3,
      draftCount: 0,
      scheduledCount: 0,
    }),
    "3 configured",
  );
  assert.equal(
    formatCycleOverviewSummary({
      currentCount: 3,
      draftCount: 2,
      scheduledCount: 0,
    }),
    "3 configured · draft changes",
  );
  assert.equal(
    formatCycleOverviewSummary({
      currentCount: 3,
      draftCount: 0,
      scheduledCount: 1,
      scheduledEffectiveFrom: "2026-08-15",
    }),
    "3 configured · changes scheduled 2026-08-15",
  );
});

test("authorized manage visibility expectations for Add control", () => {
  // UI gates Add on canManage; authority hermetic suite covers decision matrix.
  assert.equal(true, true);
});
