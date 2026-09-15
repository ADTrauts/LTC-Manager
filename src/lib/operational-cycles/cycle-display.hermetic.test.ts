import assert from "node:assert/strict";
import test from "node:test";

import { buildDietaryDefaultCyclePlans } from "./defaults";
import {
  collectExistingCycleIdentity,
  formatCycleClock,
  formatCycleRowSecondary,
  formatCycleWindow,
  formatDaysSummary,
  formatMealLabel,
  formatServiceDateLong,
  moveOrderedId,
  presentCycleReview,
  previewDietaryDefaultsAgainstExisting,
  serializeDaysOfWeek,
} from "./cycle-display";
import type { CycleDraftChange } from "./cycle-lifecycle";
import type { CycleBuilderRow } from "./load-cycle-builder";

test("formatCycleClock uses 12-hour user-facing times", () => {
  assert.equal(formatCycleClock("07:00"), "7:00 AM");
  assert.equal(formatCycleClock("13:30"), "1:30 PM");
  assert.equal(formatCycleWindow("07:00", "09:00"), "7:00 AM–9:00 AM");
});

test("formatMealLabel humanizes enums and avoids raw BREAKFAST", () => {
  assert.equal(formatMealLabel("BREAKFAST"), "Breakfast");
  assert.equal(formatMealLabel("LUNCH"), "Lunch");
  assert.equal(formatMealLabel(null), null);
  assert.ok(!formatMealLabel("BREAKFAST")!.includes("BREAKFAST"));
});

test("formatCycleRowSecondary does not duplicate meal when label matches", () => {
  assert.equal(
    formatCycleRowSecondary({
      label: "Breakfast",
      startLocal: "07:00",
      endLocal: "09:00",
      mealType: "BREAKFAST",
    }),
    "7:00 AM–9:00 AM",
  );
  assert.equal(
    formatCycleRowSecondary({
      label: "Breakfast Closeout",
      startLocal: "09:00",
      endLocal: "10:00",
      mealType: "BREAKFAST",
    }),
    "9:00 AM–10:00 AM",
  );
  assert.equal(
    formatCycleRowSecondary({
      label: "Morning Prep",
      startLocal: "05:30",
      endLocal: "07:00",
      mealType: "BREAKFAST",
    }),
    "5:30 AM–7:00 AM · Breakfast",
  );
});

test("formatDaysSummary never shows numeric weekday representation", () => {
  assert.equal(formatDaysSummary([0, 1, 2, 3, 4, 5, 6]), "Every day");
  assert.equal(formatDaysSummary([1, 2, 3, 4, 5]), "Mon · Tue · Wed · Thu · Fri");
  const summary = formatDaysSummary([0, 6]);
  assert.ok(!summary.includes("0"));
  assert.ok(!summary.includes("6"));
  assert.equal(summary, "Sun · Sat");
});

test("serializeDaysOfWeek preserves canonical numeric persistence values", () => {
  assert.equal(serializeDaysOfWeek([0, 1, 2, 3, 4, 5, 6]), "0,1,2,3,4,5,6");
  assert.equal(serializeDaysOfWeek([5, 1, 1]), "1,5");
});

test("formatServiceDateLong prefers human-readable dates", () => {
  assert.equal(formatServiceDateLong("2026-08-12"), "August 12, 2026");
});

test("moveOrderedId reorders without exposing ids to callers beyond the list", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(moveOrderedId(ids, "b", "up"), ["b", "a", "c"]);
  assert.deepEqual(moveOrderedId(ids, "b", "down"), ["a", "c", "b"]);
  assert.deepEqual(moveOrderedId(ids, "a", "up"), ["a", "b", "c"]);
});

test("previewDietaryDefaultsAgainstExisting marks label matches as already exists", () => {
  const plans = buildDietaryDefaultCyclePlans();
  const preview = previewDietaryDefaultsAgainstExisting({
    plans,
    existingStableKeys: new Set(),
    existingLabels: new Set(["breakfast"]),
  });
  const breakfast = preview.find((r) => r.label === "Breakfast");
  const lunch = preview.find((r) => r.label === "Lunch");
  assert.equal(breakfast?.status, "exists");
  assert.equal(lunch?.status, "add");
  assert.ok(preview.filter((r) => r.status === "add").length >= 7);
});

test("previewDietaryDefaultsAgainstExisting marks stableKey matches as existing", () => {
  const plans = buildDietaryDefaultCyclePlans();
  const existingStableKey = plans[1]!.stableKey;
  const preview = previewDietaryDefaultsAgainstExisting({
    plans,
    existingStableKeys: new Set([existingStableKey]),
    existingLabels: new Set(),
  });
  assert.equal(
    preview.find((r) => r.stableKey === existingStableKey)?.status,
    "exists",
  );
});

test("collectExistingCycleIdentity includes draft and published only", () => {
  const identity = collectExistingCycleIdentity([
    { stableKey: "a", label: "Breakfast", status: "DRAFT" },
    { stableKey: "b", label: "Lunch", status: "PUBLISHED" },
    { stableKey: "c", label: "Old", status: "RETIRED" },
  ] as CycleBuilderRow[]);
  assert.ok(identity.stableKeys.has("a"));
  assert.ok(identity.stableKeys.has("b"));
  assert.ok(!identity.stableKeys.has("c"));
  assert.ok(identity.labels.has("breakfast"));
  assert.ok(!identity.labels.has("old"));
});

test("presentCycleReview compact first-setup summary", () => {
  const drafts = [
    {
      stableKey: "breakfast_service",
      label: "Breakfast",
      startLocal: "07:00",
      endLocal: "09:00",
      mealType: "BREAKFAST",
    },
    {
      stableKey: "lunch_service",
      label: "Lunch",
      startLocal: "11:30",
      endLocal: "13:30",
      mealType: "LUNCH",
    },
  ] as CycleBuilderRow[];
  const changes: CycleDraftChange[] = drafts.map((d) => ({
    kind: "added",
    stableKey: d.stableKey,
    label: d.label,
    summary: `Added “${d.label}”`,
  }));
  const presented = presentCycleReview({ changes, drafts, currentCount: 0 });
  assert.equal(presented.mode, "first_setup");
  if (presented.mode === "first_setup") {
    assert.equal(presented.count, 2);
    assert.equal(presented.rows[0]?.window, "7:00 AM–9:00 AM");
    assert.ok(!presented.rows.some((r) => r.window.includes("BREAKFAST")));
  }
});

test("presentCycleReview later diffs keep meaningful timing changes", () => {
  const drafts = [
    {
      stableKey: "dinner",
      label: "Dinner",
      startLocal: "17:15",
      endLocal: "19:00",
      mealType: "DINNER",
      applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    },
  ] as CycleBuilderRow[];
  const changes: CycleDraftChange[] = [
    {
      kind: "timing",
      stableKey: "dinner",
      label: "Dinner",
      summary: "“Dinner” timing 17:00–19:00 → 17:15–19:00",
    },
  ];
  const presented = presentCycleReview({ changes, drafts, currentCount: 1 });
  assert.equal(presented.mode, "diff");
  if (presented.mode === "diff") {
    assert.ok(presented.lines.some((l) => l.includes("Start time")));
    assert.ok(presented.lines.some((l) => l.includes("5:00 PM") || l.includes("5:15 PM")));
    assert.ok(!presented.lines.some((l) => /\bDINNER\b/.test(l)));
  }
});
