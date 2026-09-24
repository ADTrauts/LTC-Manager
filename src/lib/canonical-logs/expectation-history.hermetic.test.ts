import assert from "node:assert/strict";
import test from "node:test";

import { daypartWindowsForCadence } from "@/lib/logs-architecture/timing";
import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";

import {
  projectLogExpectationHistory,
  selectSegmentForDate,
  type LogExpectationHistorySegment,
  type LogHistorySubmission,
} from "./expectation-history";
import type { LogAttachmentForResolve, PublishedCycleForLogs } from "./resolve-log-requirements";

const TZ = "America/New_York";

function windowsFor(cadence: "TWICE_DAILY" | "THREE_TIMES_DAILY" | "ONCE_DAILY") {
  return daypartWindowsForCadence(cadence).map((w, i) => ({
    label: w.label,
    startLocal: w.startLocal,
    endLocal: w.endLocal,
    displaySequence: (i + 1) * 10,
  }));
}

function coolerSegment(
  overrides?: Partial<LogAttachmentForResolve>,
): LogExpectationHistorySegment {
  return {
    id: "att-cooler",
    stableKey: "att_cooler_1",
    facilityId: "f1",
    departmentId: "d1",
    catalogStableKey: "cooler_temperature_log",
    catalogVersion: 1,
    status: "ACTIVE",
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: null,
    timingMode: "DAILY_WINDOWS",
    allowAdHoc: false,
    calendarCadence: null,
    calendarDaysOfWeek: [],
    calendarDayOfMonth: null,
    calendarDueTimeLocal: null,
    localDisplayLabel: null,
    localInstructions: null,
    targetKind: "ASSET",
    assetId: "cooler-1",
    spaceId: null,
    unitId: null,
    targetDepartmentId: null,
    operationalTypeKey: null,
    dailyWindows: windowsFor("TWICE_DAILY"),
    cycleSelections: [],
    catalogDefinition: {
      id: "cat-cooler",
      name: "Cooler Temperature Log",
      purposeType: "LOG",
      instructions: "Check cooler.",
      status: "PUBLISHED",
      fields: [
        {
          fieldKey: "cooler_temperature",
          label: "Cooler temperature",
          fieldType: "TEMPERATURE",
          isRequired: true,
          displaySequence: 10,
          helpText: null,
          unitLabel: "°F",
          minNumber: 33,
          maxNumber: 41,
          allowedSelections: [],
          correctiveActionTrigger: true,
          correctiveActionRequired: true,
        },
      ],
    },
    ...overrides,
  };
}

function cycleWindow(
  operationalDateKey: string,
  stableKey: string,
  label: string,
  startLocal: string,
  endLocal: string,
): PublishedCycleForLogs {
  const instants = resolveCycleWindowInstants({
    operationalDateKey,
    startLocal,
    endLocal,
    overnight: false,
    facilityTimezone: TZ,
  });
  assert.ok(instants);
  return {
    stableKey,
    label,
    startLocal,
    endLocal,
    overnight: false,
    startsAt: instants.startsAt,
    endsAt: instants.endsAt,
  };
}

function slotStates(day: { slots: Array<{ slotLabel: string; state: string }> }) {
  return Object.fromEntries(day.slots.map((slot) => [slot.slotLabel, slot.state]));
}

test("cooler history: complete / not complete / due across service dates", () => {
  const attachment = coolerSegment({
    effectiveFrom: new Date("2026-09-13T00:00:00.000Z"),
  });
  const morningKey = projectLogExpectationHistory({
    segments: [attachment],
    fromDateKey: "2026-09-13",
    toDateKey: "2026-09-13",
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [],
  })[0]!.slots.find((s) => s.slotLabel === "Morning")!.requirementKey;
  const afternoonKey = projectLogExpectationHistory({
    segments: [attachment],
    fromDateKey: "2026-09-13",
    toDateKey: "2026-09-13",
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [],
  })[0]!.slots.find((s) => s.slotLabel === "Afternoon")!.requirementKey;

  const submissions: LogHistorySubmission[] = [
    {
      id: "r-sep13-am",
      operationalDateKey: "2026-09-13",
      requirementKey: morningKey,
      logRequirementKey: morningKey,
      status: "COMPLETED",
      valueNumber: 38,
      unitLabel: "°F",
    },
    {
      id: "r-sep14-am",
      operationalDateKey: "2026-09-14",
      requirementKey: projectLogExpectationHistory({
        segments: [attachment],
        fromDateKey: "2026-09-14",
        toDateKey: "2026-09-14",
        todayKey: "2026-09-15",
        now: new Date("2026-09-15T17:00:00.000Z"),
        facilityTimezone: TZ,
        submissions: [],
      })[0]!.slots.find((s) => s.slotLabel === "Morning")!.requirementKey,
      logRequirementKey: null,
      status: "COMPLETED",
      valueNumber: 37,
      unitLabel: "°F",
    },
    {
      id: "r-sep14-pm",
      operationalDateKey: "2026-09-14",
      requirementKey: projectLogExpectationHistory({
        segments: [attachment],
        fromDateKey: "2026-09-14",
        toDateKey: "2026-09-14",
        todayKey: "2026-09-15",
        now: new Date("2026-09-15T17:00:00.000Z"),
        facilityTimezone: TZ,
        submissions: [],
      })[0]!.slots.find((s) => s.slotLabel === "Afternoon")!.requirementKey,
      logRequirementKey: null,
      status: "COMPLETED",
      valueNumber: 39,
      unitLabel: "°F",
    },
    {
      id: "r-sep15-am",
      operationalDateKey: "2026-09-15",
      requirementKey: projectLogExpectationHistory({
        segments: [attachment],
        fromDateKey: "2026-09-15",
        toDateKey: "2026-09-15",
        todayKey: "2026-09-15",
        now: new Date("2026-09-15T17:00:00.000Z"),
        facilityTimezone: TZ,
        submissions: [],
      })[0]!.slots.find((s) => s.slotLabel === "Morning")!.requirementKey,
      logRequirementKey: null,
      status: "COMPLETED",
      valueNumber: 38,
      unitLabel: "°F",
    },
  ];

  const days = projectLogExpectationHistory({
    segments: [attachment],
    fromDateKey: "2026-09-13",
    toDateKey: "2026-09-15",
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    submissions,
  });

  assert.deepEqual(slotStates(days[0]!), {
    Morning: "COMPLETE",
    Afternoon: "NOT_COMPLETE",
  });
  assert.equal(days[0]!.slots.find((s) => s.slotLabel === "Morning")!.valueSummary?.display, "38°F");
  assert.equal(days[0]!.slots.find((s) => s.slotLabel === "Afternoon")!.stateLabel, "Not complete");

  assert.deepEqual(slotStates(days[1]!), {
    Morning: "COMPLETE",
    Afternoon: "COMPLETE",
  });

  assert.deepEqual(slotStates(days[2]!), {
    Morning: "COMPLETE",
    Afternoon: "DUE",
  });
  assert.equal(afternoonKey.includes("11:00"), true);
});

test("schedule change: twice daily then three times daily does not rewrite earlier days", () => {
  const twice = coolerSegment({
    id: "att-v1",
    stableKey: "att_cooler_twice",
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-09-10T00:00:00.000Z"),
    status: "INACTIVE",
    dailyWindows: windowsFor("TWICE_DAILY"),
  });
  const thrice = coolerSegment({
    id: "att-v2",
    stableKey: "att_cooler_thrice",
    effectiveFrom: new Date("2026-09-11T00:00:00.000Z"),
    effectiveTo: null,
    dailyWindows: windowsFor("THREE_TIMES_DAILY"),
  });

  const days = projectLogExpectationHistory({
    segments: [twice, thrice],
    fromDateKey: "2026-09-05",
    toDateKey: "2026-09-12",
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [],
  });

  const sep5 = days.find((d) => d.operationalDateKey === "2026-09-05")!;
  const sep12 = days.find((d) => d.operationalDateKey === "2026-09-12")!;
  assert.equal(sep5.slots.length, 2);
  assert.deepEqual(
    sep5.slots.map((s) => s.slotLabel),
    ["Morning", "Afternoon"],
  );
  assert.ok(sep5.slots.every((s) => s.state === "NOT_COMPLETE"));
  assert.equal(sep12.slots.length, 3);
  assert.deepEqual(
    sep12.slots.map((s) => s.slotLabel),
    ["Morning", "Afternoon", "Evening"],
  );
});

test("in-place cadence overwrite cannot reconstruct prior twice-daily history", () => {
  const overwritten = coolerSegment({
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    dailyWindows: windowsFor("THREE_TIMES_DAILY"),
  });
  const sep5 = projectLogExpectationHistory({
    segments: [overwritten],
    fromDateKey: "2026-09-05",
    toDateKey: "2026-09-05",
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [],
  })[0]!;
  assert.equal(sep5.slots.length, 3);
});

test("retired attachment: slots reconstruct through last effective date; later days are not required", () => {
  const retired = coolerSegment({
    status: "RETIRED",
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-09-10T00:00:00.000Z"),
  });
  const days = projectLogExpectationHistory({
    segments: [retired],
    fromDateKey: "2026-09-09",
    toDateKey: "2026-09-12",
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [],
  });
  const sep9 = days.find((d) => d.operationalDateKey === "2026-09-09")!;
  const sep12 = days.find((d) => d.operationalDateKey === "2026-09-12")!;
  assert.equal(sep9.expected, true);
  assert.equal(sep9.slots.length, 2);
  assert.ok(sep9.slots.every((s) => s.state === "NOT_COMPLETE"));
  assert.equal(sep12.expected, false);
  assert.equal(sep12.slots.length, 0);
  assert.equal(selectSegmentForDate([retired], "2026-09-12"), null);
});

test("cycle-based dishwasher history uses cycle labels, not MealType; missing dinner is Not complete", () => {
  const dishwasher: LogExpectationHistorySegment = {
    ...coolerSegment({
      id: "att-dw",
      stableKey: "att_dw_1",
      catalogStableKey: "low_temp_chemical_dishwasher_log",
      catalogVersion: 1,
      timingMode: "OPERATIONAL_CYCLE",
      dailyWindows: [],
      cycleSelections: [
        { cycleStableKey: "breakfast", displaySequence: 10 },
        { cycleStableKey: "lunch", displaySequence: 20 },
        { cycleStableKey: "dinner", displaySequence: 30 },
      ],
      targetKind: "ASSET",
      assetId: "dw-1",
    }),
    catalogDefinition: {
      id: "cat-dw",
      name: "Low-Temperature Chemical Dishwasher Log",
      purposeType: "LOG",
      instructions: "Check sanitizer.",
      status: "PUBLISHED",
      fields: [],
    },
  };

  const dateKey = "2026-09-13";
  const cycles = [
    cycleWindow(dateKey, "breakfast", "Breakfast", "06:00", "10:00"),
    cycleWindow(dateKey, "lunch", "Lunch", "10:30", "14:00"),
    cycleWindow(dateKey, "dinner", "Dinner", "16:00", "20:00"),
  ];

  const empty = projectLogExpectationHistory({
    segments: [dishwasher],
    fromDateKey: dateKey,
    toDateKey: dateKey,
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    publishedCyclesByDate: { [dateKey]: cycles },
    submissions: [],
  })[0]!;
  assert.deepEqual(
    empty.slots.map((s) => s.slotLabel),
    ["Breakfast", "Lunch", "Dinner"],
  );
  assert.ok(empty.slots.every((s) => !s.requirementKey.toLowerCase().includes("meal")));
  const dinnerKey = empty.slots.find((s) => s.slotLabel === "Dinner")!.requirementKey;
  const breakfastKey = empty.slots.find((s) => s.slotLabel === "Breakfast")!.requirementKey;
  const lunchKey = empty.slots.find((s) => s.slotLabel === "Lunch")!.requirementKey;

  const withTwo = projectLogExpectationHistory({
    segments: [dishwasher],
    fromDateKey: dateKey,
    toDateKey: dateKey,
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    publishedCyclesByDate: { [dateKey]: cycles },
    submissions: [
      {
        id: "b",
        operationalDateKey: dateKey,
        requirementKey: breakfastKey,
        logRequirementKey: breakfastKey,
        status: "COMPLETED",
      },
      {
        id: "l",
        operationalDateKey: dateKey,
        requirementKey: lunchKey,
        logRequirementKey: lunchKey,
        status: "COMPLETED",
      },
    ],
  })[0]!;
  assert.deepEqual(slotStates(withTwo), {
    Breakfast: "COMPLETE",
    Lunch: "COMPLETE",
    Dinner: "NOT_COMPLETE",
  });
  assert.equal(dinnerKey.includes("dinner"), true);
});

test("ad hoc receiving log has no expected slots and never Not complete", () => {
  const receiving = coolerSegment({
    id: "att-recv",
    stableKey: "att_recv_1",
    catalogStableKey: "receiving_temperature_log",
    timingMode: "AD_HOC",
    allowAdHoc: true,
    dailyWindows: [],
  });
  const days = projectLogExpectationHistory({
    segments: [receiving],
    fromDateKey: "2026-09-13",
    toDateKey: "2026-09-14",
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [
      {
        id: "manual-1",
        operationalDateKey: "2026-09-13",
        requirementKey: "att_recv_1|adhoc",
        logRequirementKey: "att_recv_1|adhoc",
        status: "COMPLETED",
        valueNumber: 41,
        unitLabel: "°F",
      },
    ],
  });
  assert.equal(days[0]!.expected, false);
  assert.equal(days[0]!.slots.length, 0);
  assert.equal(days[0]!.unscheduledRecords.length, 1);
  assert.equal(days[1]!.unscheduledRecords.length, 0);
  assert.ok(days.every((d) => d.slots.every((s) => s.state !== "NOT_COMPLETE")));
});

test("corrective-action submission is Complete with corrective action, not ordinary Complete", () => {
  const attachment = coolerSegment({
    effectiveFrom: new Date("2026-09-13T00:00:00.000Z"),
  });
  const preview = projectLogExpectationHistory({
    segments: [attachment],
    fromDateKey: "2026-09-13",
    toDateKey: "2026-09-13",
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [],
  })[0]!;
  const morningKey = preview.slots.find((s) => s.slotLabel === "Morning")!.requirementKey;
  const day = projectLogExpectationHistory({
    segments: [attachment],
    fromDateKey: "2026-09-13",
    toDateKey: "2026-09-13",
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [
      {
        id: "hot",
        operationalDateKey: "2026-09-13",
        requirementKey: morningKey,
        logRequirementKey: morningKey,
        status: "COMPLETED_WITH_CORRECTIVE_ACTION",
        valueNumber: 45,
        unitLabel: "°F",
        outOfStandard: true,
      },
    ],
  })[0]!;
  const morning = day.slots.find((s) => s.slotLabel === "Morning")!;
  assert.equal(morning.state, "COMPLETE_WITH_CORRECTIVE_ACTION");
  assert.equal(morning.stateLabel, "Complete with corrective action");
  assert.equal(morning.valueSummary?.display, "45°F");
  assert.equal(morning.valueSummary?.outOfStandard, true);
});

test("catalog version pin is preserved per segment; submissions keep their captured version", () => {
  const v3 = coolerSegment({
    id: "att-v3",
    stableKey: "att_cooler_v3",
    catalogVersion: 3,
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-09-10T00:00:00.000Z"),
    status: "INACTIVE",
  });
  const v4 = coolerSegment({
    id: "att-v4",
    stableKey: "att_cooler_v4",
    catalogVersion: 4,
    effectiveFrom: new Date("2026-09-11T00:00:00.000Z"),
  });
  const sep5Preview = projectLogExpectationHistory({
    segments: [v3, v4],
    fromDateKey: "2026-09-05",
    toDateKey: "2026-09-05",
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [],
  })[0]!;
  const morningKey = sep5Preview.slots.find((s) => s.slotLabel === "Morning")!.requirementKey;
  const days = projectLogExpectationHistory({
    segments: [v3, v4],
    fromDateKey: "2026-09-05",
    toDateKey: "2026-09-12",
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [
      {
        id: "old",
        operationalDateKey: "2026-09-05",
        requirementKey: morningKey,
        logRequirementKey: morningKey,
        status: "COMPLETED",
        catalogVersion: 3,
        valueNumber: 36,
        unitLabel: "°F",
      },
    ],
  });
  const sep5 = days.find((d) => d.operationalDateKey === "2026-09-05")!;
  const sep12 = days.find((d) => d.operationalDateKey === "2026-09-12")!;
  assert.equal(sep5.slots.find((s) => s.slotLabel === "Morning")!.catalogVersion, 3);
  assert.equal(sep12.slots[0]!.catalogVersion, 4);
});

test("today overdue remains Overdue; yesterday unsubmitted is Not complete", () => {
  const attachment = coolerSegment({
    effectiveFrom: new Date("2026-09-14T00:00:00.000Z"),
  });
  const afterWindows = new Date("2026-09-15T21:00:00.000Z");
  const days = projectLogExpectationHistory({
    segments: [attachment],
    fromDateKey: "2026-09-14",
    toDateKey: "2026-09-15",
    todayKey: "2026-09-15",
    now: afterWindows,
    facilityTimezone: TZ,
    submissions: [],
  });
  assert.ok(days[0]!.slots.every((s) => s.state === "NOT_COMPLETE"));
  assert.ok(days[1]!.slots.every((s) => s.state === "OVERDUE"));
});

test("future service date expected slots are Upcoming, not Not complete", () => {
  const attachment = coolerSegment({
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
  });
  const day = projectLogExpectationHistory({
    segments: [attachment],
    fromDateKey: "2026-09-16",
    toDateKey: "2026-09-16",
    todayKey: "2026-09-15",
    now: new Date("2026-09-15T17:00:00.000Z"),
    facilityTimezone: TZ,
    submissions: [],
  })[0]!;
  assert.equal(day.expected, true);
  assert.ok(day.slots.every((s) => s.state === "UPCOMING"));
});
