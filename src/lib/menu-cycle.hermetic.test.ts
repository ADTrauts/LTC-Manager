import assert from "node:assert/strict";
import test from "node:test";

import {
  cyclePositionForDate,
  dayIndexForDate,
  DEFAULT_MENU_PERIODS,
  ensureMenuSettingsDefaults,
  menuForDate,
  menuPeriodKeyForMealType,
  rotationForServiceDateKey,
  storedMenuPeriodConfigs,
  usableMenuRuntimeCycleSettings,
} from "@/lib/menu-cycle";

test("cyclePositionForDate maps the anchor to week 1 and wraps the cycle", () => {
  const settings = { cycleLengthWeeks: 3, cycleAnchorDate: new Date("2026-01-04T00:00:00") };
  assert.deepEqual(cyclePositionForDate(new Date("2026-01-04T12:00:00"), settings), { weekNumber: 1 });
  assert.deepEqual(cyclePositionForDate(new Date("2026-01-11T12:00:00"), settings), { weekNumber: 2 });
  assert.deepEqual(cyclePositionForDate(new Date("2026-01-18T12:00:00"), settings), { weekNumber: 3 });
  assert.deepEqual(cyclePositionForDate(new Date("2026-01-25T12:00:00"), settings), { weekNumber: 1 });
  assert.deepEqual(cyclePositionForDate(new Date("2025-12-28T12:00:00"), settings), { weekNumber: 3 });
});

test("dayIndexForDate uses Sunday-first or Monday-first numbering", () => {
  const sunday = new Date("2026-01-04T12:00:00");
  const monday = new Date("2026-01-05T12:00:00");
  assert.equal(dayIndexForDate(sunday, "SUNDAY"), 0);
  assert.equal(dayIndexForDate(monday, "SUNDAY"), 1);
  assert.equal(dayIndexForDate(monday, "MONDAY"), 0);
  assert.equal(dayIndexForDate(sunday, "MONDAY"), 6);
});

test("ensureMenuSettingsDefaults restores Breakfast/Lunch/Dinner when JSON is missing or empty", () => {
  const fromNull = ensureMenuSettingsDefaults(null);
  assert.equal(fromNull.cycleLengthWeeks, 3);
  assert.deepEqual(fromNull.periods, DEFAULT_MENU_PERIODS);

  const fromEmpty = ensureMenuSettingsDefaults({
    cycleLengthWeeks: 4,
    weekStartsOn: "MONDAY",
    cycleAnchorDate: new Date("2026-02-01"),
    periodConfigJson: [],
  });
  assert.equal(fromEmpty.cycleLengthWeeks, 4);
  assert.equal(fromEmpty.weekStartsOn, "MONDAY");
  assert.deepEqual(fromEmpty.periods, DEFAULT_MENU_PERIODS);
});

test("menuForDate groups one menu's items for the computed week and day", () => {
  const settings = ensureMenuSettingsDefaults({
    cycleLengthWeeks: 3,
    weekStartsOn: "SUNDAY",
    cycleAnchorDate: new Date("2026-01-04"),
    periodConfigJson: DEFAULT_MENU_PERIODS,
  });
  const result = menuForDate({
    date: new Date("2026-01-04T12:00:00"),
    settings,
    periods: settings.periods,
    menuItems: [
      {
        weekNumber: 1,
        dayIndex: 0,
        mealPeriodKey: "BREAKFAST",
        category: "Entrees",
        itemName: "Oatmeal",
        portionValue: null,
        portionUnit: null,
        entryType: "FIXED",
        displayOrder: 1,
      },
      {
        weekNumber: 2,
        dayIndex: 0,
        mealPeriodKey: "BREAKFAST",
        category: "Entrees",
        itemName: "Wrong week",
        portionValue: null,
        portionUnit: null,
        entryType: "FIXED",
        displayOrder: 1,
      },
    ],
  });
  assert.equal(result.weekNumber, 1);
  assert.equal(result.dayIndex, 0);
  assert.deepEqual(result.grouped.BREAKFAST?.Entrees, ["Oatmeal"]);
});

test("menuPeriodKeyForMealType matches configured keys, not Operational Cycle slugs", () => {
  const periods = ensureMenuSettingsDefaults({ periodConfigJson: DEFAULT_MENU_PERIODS }).periods;
  assert.equal(menuPeriodKeyForMealType("BREAKFAST", periods), "BREAKFAST");
  assert.equal(menuPeriodKeyForMealType("LUNCH", periods), "LUNCH");
  assert.equal(
    menuPeriodKeyForMealType("BREAKFAST", [{ key: "MORNING", label: "Breakfast", categories: ["Entrees"] }]),
    "MORNING",
  );
});

test("rotationForServiceDateKey uses civil UTC weekday, not host-timezone Date#getDay", () => {
  const settings = {
    cycleLengthWeeks: 3,
    weekStartsOn: "SUNDAY" as const,
    cycleAnchorDate: new Date("2026-01-04T00:00:00.000Z"),
  };
  assert.deepEqual(rotationForServiceDateKey("2026-01-04", settings), { weekNumber: 1, dayIndex: 0 });
  assert.deepEqual(rotationForServiceDateKey("2026-01-05", settings), { weekNumber: 1, dayIndex: 1 });
  assert.deepEqual(rotationForServiceDateKey("2026-01-11", settings), { weekNumber: 2, dayIndex: 0 });
  assert.deepEqual(rotationForServiceDateKey("2026-01-25", settings), { weekNumber: 1, dayIndex: 0 });
  assert.deepEqual(rotationForServiceDateKey("2025-12-28", settings), { weekNumber: 3, dayIndex: 0 });

  const monday = { ...settings, weekStartsOn: "MONDAY" as const };
  assert.deepEqual(rotationForServiceDateKey("2026-01-05", monday), { weekNumber: 1, dayIndex: 0 });
  assert.deepEqual(rotationForServiceDateKey("2026-01-04", monday), { weekNumber: 1, dayIndex: 6 });

  const fourWeek = { ...settings, cycleLengthWeeks: 4 };
  assert.deepEqual(rotationForServiceDateKey("2026-01-25", fourWeek), { weekNumber: 4, dayIndex: 0 });
  assert.deepEqual(rotationForServiceDateKey("2026-02-01", fourWeek), { weekNumber: 1, dayIndex: 0 });

  // 2026-10-15 is Thursday. UTC midnight is Wednesday evening in US timezones.
  // Civil resolution must stay Thursday (Sunday-start dayIndex 4).
  assert.equal(new Date(Date.UTC(2026, 9, 15)).getUTCDay(), 4);
  assert.equal(rotationForServiceDateKey("2026-10-15", settings).dayIndex, 4);
});

test("storedMenuPeriodConfigs and usable settings do not fabricate Build defaults", () => {
  assert.deepEqual(storedMenuPeriodConfigs(null), []);
  assert.deepEqual(storedMenuPeriodConfigs([]), []);
  assert.equal(usableMenuRuntimeCycleSettings(null), null);
  assert.equal(usableMenuRuntimeCycleSettings({ cycleLengthWeeks: 2, weekStartsOn: "SUNDAY", cycleAnchorDate: new Date() }), null);
});
