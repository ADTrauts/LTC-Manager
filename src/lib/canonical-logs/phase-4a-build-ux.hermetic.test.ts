import assert from "node:assert/strict";
import test from "node:test";

import { resolveDefaultAttachmentEffectiveFromKey } from "./effective-from";
import {
  catalogMatchesTarget,
  parseCatalogSuggestions,
  rankCatalogBySuggestion,
} from "./suggestions";
import {
  catalogCadenceLabel,
  formatLocalTime12h,
  formatTimingSummary,
} from "./timing-display";
import { resolveAttachTimingProposal } from "./attach-timing";
import { filterCatalogCards, catalogCategoryLabel, catalogPurposeLabel } from "./catalog-browse";
import type { CatalogBrowseCard } from "./catalog-browse";

test("suggestion matching is deterministic and forgiving for equipment types", () => {
  const suggestions = parseCatalogSuggestions({
    assetTypes: ["REACH_IN_COOLER", "COOLER"],
    spaceTypes: ["SERVERY"],
    departmentKeys: ["DIETARY"],
    keywords: ["opening"],
  });
  assert.equal(
    catalogMatchesTarget(suggestions, { kind: "ASSET", equipmentType: "Reach-In Cooler" }),
    true,
  );
  assert.equal(
    catalogMatchesTarget(suggestions, { kind: "ASSET", equipmentType: "Dishwasher" }),
    false,
  );
  assert.equal(
    catalogMatchesTarget(suggestions, {
      kind: "SPACE",
      roomTypeHints: ["Servery"],
    }),
    true,
  );
  assert.equal(
    catalogMatchesTarget(suggestions, {
      kind: "UNIT",
      unitName: "Opening Servery Area",
      departmentKey: "DIETARY",
    }),
    true,
  );
});

test("rankCatalogBySuggestion floats suggested first without dropping others", () => {
  const ranked = rankCatalogBySuggestion(
    [{ id: "a" }, { id: "b" }, { id: "c" }],
    (item) => item.id === "b",
  );
  assert.deepEqual(
    ranked.map((r) => r.id),
    ["b", "a", "c"],
  );
  assert.equal(ranked[0]!.suggested, true);
});

test("timing display never exposes raw enums or MealType", () => {
  assert.equal(formatLocalTime12h("05:00"), "5:00 AM");
  assert.equal(formatLocalTime12h("16:00"), "4:00 PM");
  assert.equal(catalogCadenceLabel("TWICE_DAILY"), "Twice daily");
  const summary = formatTimingSummary({
    timingMode: "DAILY_WINDOWS",
    recommendedCadence: "TWICE_DAILY",
    dailyWindows: [
      { label: "Morning", startLocal: "05:00", endLocal: "11:00" },
      { label: "Afternoon", startLocal: "11:00", endLocal: "16:00" },
    ],
    cycleLabels: [],
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    allowAdHoc: false,
  });
  assert.match(summary, /Twice daily/);
  assert.match(summary, /Morning and afternoon/i);
  assert.doesNotMatch(summary, /DAILY_WINDOWS|MealType|OPERATIONAL_CYCLE/);

  const cycles = formatTimingSummary({
    timingMode: "OPERATIONAL_CYCLE",
    recommendedCadence: "ONCE_PER_OPERATIONAL_CYCLE",
    dailyWindows: [],
    cycleLabels: ["Breakfast", "Lunch", "Dinner"],
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    allowAdHoc: false,
  });
  assert.equal(cycles, "Breakfast · Lunch · Dinner");
  assert.doesNotMatch(cycles, /MealType/);

  assert.equal(
    formatTimingSummary({
      timingMode: "AD_HOC",
      recommendedCadence: "AD_HOC",
      dailyWindows: [],
      cycleLabels: [],
      calendarCadence: null,
      calendarDaysOfWeek: [],
      calendarDayOfMonth: null,
      allowAdHoc: true,
    }),
    "As needed",
  );
});

test("cooler attach timing resolves twice daily without Needs setup", () => {
  const timing = resolveAttachTimingProposal({
    recommendedCadence: "TWICE_DAILY",
    recommendedScheduleKind: "FIXED_DAILY_WINDOW",
    recommendedDaypartLabels: ["Morning", "Afternoon"],
    publishedCycleStableKeys: [],
    cycleLabelByKey: new Map(),
  });
  assert.equal(timing.needsSetup, false);
  assert.equal(timing.timingMode, "DAILY_WINDOWS");
  assert.equal(timing.dailyWindows.length, 2);
  assert.equal(timing.usingRecommendedSchedule, true);
  assert.match(timing.timingSummary, /Twice daily/);
});

test("dishwasher attach timing preselects published Operational Cycles", () => {
  const timing = resolveAttachTimingProposal({
    recommendedCadence: "ONCE_PER_OPERATIONAL_CYCLE",
    recommendedScheduleKind: "OPERATIONAL_CYCLE",
    recommendedDaypartLabels: [],
    publishedCycleStableKeys: ["breakfast", "lunch", "dinner"],
    cycleLabelByKey: new Map([
      ["breakfast", "Breakfast"],
      ["lunch", "Lunch"],
      ["dinner", "Dinner"],
    ]),
  });
  assert.equal(timing.needsSetup, false);
  assert.deepEqual(timing.cycleStableKeys, ["breakfast", "lunch", "dinner"]);
  assert.equal(timing.timingSummary, "Breakfast · Lunch · Dinner");
  assert.doesNotMatch(timing.timingSummary, /MealType/);
});

test("prospective effective date starts tomorrow — not current service day", () => {
  const resolved = resolveDefaultAttachmentEffectiveFromKey({
    facilityTimezone: "America/New_York",
    now: new Date("2026-09-13T20:00:00.000Z"), // afternoon/evening ET
  });
  assert.equal(resolved.startsTomorrow, true);
  assert.equal(resolved.effectiveFromKey, "2026-09-14");
  assert.match(resolved.label, /tomorrow|Sep 14/i);
});

test("catalog filter search and category — no facility edit fields in card model", () => {
  const cards: CatalogBrowseCard[] = [
    {
      id: "1",
      stableKey: "cooler_temperature_log",
      version: 1,
      name: "Cooler Temperature Log",
      description: "Record cooler temperatures",
      category: "TEMPERATURE",
      categoryLabel: catalogCategoryLabel("TEMPERATURE"),
      purposeType: "LOG",
      purposeLabel: catalogPurposeLabel("LOG"),
      recommendedCadence: "TWICE_DAILY",
      recommendedCadenceLabel: "Twice daily",
      suggestedForLabels: ["Cooler"],
      suggestions: { assetTypes: ["COOLER"], spaceTypes: [], departmentKeys: [], keywords: [] },
      maintainedByLtcCorp: true,
    },
    {
      id: "2",
      stableKey: "opening_checklist",
      version: 1,
      name: "Opening Checklist",
      description: "Opening checklist",
      category: "OPENING_CLOSING",
      categoryLabel: catalogCategoryLabel("OPENING_CLOSING"),
      purposeType: "CHECKLIST",
      purposeLabel: catalogPurposeLabel("CHECKLIST"),
      recommendedCadence: "ONCE_DAILY",
      recommendedCadenceLabel: "Once daily",
      suggestedForLabels: ["Servery"],
      suggestions: { assetTypes: [], spaceTypes: ["SERVERY"], departmentKeys: [], keywords: [] },
      maintainedByLtcCorp: true,
    },
  ];
  assert.equal(filterCatalogCards(cards, { search: "cooler" }).length, 1);
  assert.equal(filterCatalogCards(cards, { category: "OPENING_CLOSING" }).length, 1);
  assert.equal(filterCatalogCards(cards, { purpose: "CHECKLIST" })[0]!.purposeType, "CHECKLIST");
  assert.ok(!("fields" in cards[0]!));
});
