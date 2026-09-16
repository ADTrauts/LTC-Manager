import assert from "node:assert/strict";
import test from "node:test";

import type { KeyTimeDayTiming } from "./key-time-day-expectation";
import {
  detectRunModelProvenance,
  presentDepartmentRunOperation,
  presentLocationRunOperation,
  presentationContainsLegacyMealCopy,
  selectCurrentDayKeyTimeGroups,
  serializeLocationRunProof,
} from "./present-run-operation";
import type { OperationalCycleDefinition } from "./types";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const TZ = "UTC";
const DATE_KEY = "2026-08-17";
const NAVAL = "naval-park-servery";
const LIGHTHOUSE = "lighthouse-servery";

function at(hhMm: string): Date {
  const [h, m] = hhMm.split(":").map(Number);
  return new Date(Date.UTC(2026, 7, 17, h, m, 0, 0));
}

function cycle(
  partial: Partial<OperationalCycleDefinition> & Pick<OperationalCycleDefinition, "stableKey">,
): OperationalCycleDefinition {
  return {
    id: partial.id ?? partial.stableKey,
    stableKey: partial.stableKey,
    parentStableKey: partial.parentStableKey ?? null,
    nodeKind: partial.nodeKind ?? "PERIOD",
    version: partial.version ?? 1,
    label: partial.label ?? partial.stableKey,
    description: partial.description ?? null,
    cycleType: partial.cycleType ?? "CUSTOM",
    displaySequence: partial.displaySequence ?? 10,
    startLocal:
      partial.startLocal !== undefined
        ? partial.startLocal
        : partial.nodeKind === "KEY_TIME"
          ? null
          : "10:00",
    endLocal:
      partial.endLocal !== undefined
        ? partial.endLocal
        : partial.nodeKind === "KEY_TIME"
          ? null
          : "14:00",
    overnight: partial.overnight ?? false,
    applicableDaysOfWeek: partial.applicableDaysOfWeek ?? ALL_DAYS,
    effectiveFrom: partial.effectiveFrom ?? new Date("2026-08-01T00:00:00.000Z"),
    effectiveTo: partial.effectiveTo ?? null,
    mealType: partial.mealType ?? null,
    locationMode: partial.locationMode ?? "EXPLICIT_UNITS",
    locationInheritFromParent: partial.locationInheritFromParent ?? false,
    applicableUnitTypes: partial.applicableUnitTypes ?? [],
    roomTypeKey: partial.roomTypeKey ?? null,
    expectedMilestones: partial.expectedMilestones ?? [],
    status: partial.status ?? "PUBLISHED",
    unitIds: partial.unitIds ?? [],
    spaceIds: partial.spaceIds ?? [],
    milestoneTimes: partial.milestoneTimes ?? [],
    keyTimeGroups: partial.keyTimeGroups ?? [],
  };
}

function lunchHierarchy(rooms: string[] = [NAVAL]): OperationalCycleDefinition[] {
  return [
    cycle({
      stableKey: "lunch",
      label: "Lunch",
      startLocal: "10:00",
      endLocal: "14:00",
      displaySequence: 20,
      mealType: "LUNCH",
      spaceIds: rooms,
      expectedMilestones: [],
    }),
    cycle({
      stableKey: "lunch_prep",
      label: "Prep",
      parentStableKey: "lunch",
      startLocal: "10:00",
      endLocal: "11:30",
      displaySequence: 21,
      locationInheritFromParent: true,
      spaceIds: [],
      expectedMilestones: [],
    }),
    cycle({
      stableKey: "lunch_due",
      label: "1st Round Lunch Due",
      parentStableKey: "lunch",
      nodeKind: "KEY_TIME",
      startLocal: null,
      endLocal: null,
      displaySequence: 22,
      keyTimeGroups: [{ id: "g-lunch-due", dueLocal: "12:00", spaceIds: rooms }],
    }),
    cycle({
      stableKey: "lunch_cleanup",
      label: "Cleanup",
      parentStableKey: "lunch",
      startLocal: "13:30",
      endLocal: "14:00",
      displaySequence: 23,
      locationInheritFromParent: true,
      spaceIds: [],
      expectedMilestones: [],
    }),
  ];
}

function navalTiming(partial: Partial<KeyTimeDayTiming> = {}): KeyTimeDayTiming {
  return {
    expectationId: "exp-naval",
    spaceId: NAVAL,
    spaceName: "Naval Park Servery",
    facilityRoomTypeName: "Servery",
    unitId: "unit-1a",
    unitName: "1A – Naval Park",
    cycleId: "lunch_due",
    cycleStableKey: "lunch_due",
    cycleVersion: 1,
    cycleLabel: "1st Round Lunch Due",
    parentCycleLabel: "Lunch",
    displayPath: "Lunch → 1st Round Lunch Due",
    keyTimeGroupId: "g-lunch-due",
    configuredDueLocal: "12:00",
    adjustedDueLocal: null,
    expectedToday: "12:00",
    actualDueLocal: null,
    completedAt: null,
    adjustedAt: null,
    ...partial,
  };
}

const NAVAL_LOCATION = {
  title: "Naval Park Servery",
  roomTypeLabel: "Servery",
  contextLabel: "1A – Naval Park · Floor 1",
  spaceId: NAVAL,
  unitId: "unit-1a",
};

function presentAt(hhMm: string, rooms: string[] = [NAVAL]) {
  return presentLocationRunOperation({
    cycles: lunchHierarchy(rooms),
    timings: [navalTiming()],
    now: at(hhMm),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: NAVAL,
    location: NAVAL_LOCATION,
    nowLocalHhMm: hhMm,
  });
}

test("new PERIOD + KEY_TIME published set is NEW_PERIOD_KEY_TIME provenance", () => {
  assert.equal(detectRunModelProvenance(lunchHierarchy()), "NEW_PERIOD_KEY_TIME");
});

test("legacy SERVICE_STARTED period without KEY_TIME stays LEGACY", () => {
  const legacy = [
    cycle({
      stableKey: "lunch",
      label: "Lunch",
      startLocal: "10:00",
      endLocal: "14:00",
      mealType: "LUNCH",
      expectedMilestones: ["SERVICE_STARTED"],
      locationMode: "ALL_DEPARTMENT_UNITS",
      spaceIds: [],
    }),
  ];
  assert.equal(detectRunModelProvenance(legacy), "LEGACY_MEAL_SERVICE");
});

test("draft KEY_TIME is ignored for provenance and runtime", () => {
  const cycles = [
    cycle({
      stableKey: "lunch",
      label: "Lunch",
      startLocal: "10:00",
      endLocal: "14:00",
      spaceIds: [NAVAL],
    }),
    cycle({
      stableKey: "lunch_due",
      label: "1st Round Lunch Due",
      parentStableKey: "lunch",
      nodeKind: "KEY_TIME",
      startLocal: null,
      endLocal: null,
      status: "DRAFT",
      keyTimeGroups: [{ id: "g", dueLocal: "12:00", spaceIds: [NAVAL] }],
    }),
  ];
  assert.equal(detectRunModelProvenance(cycles), "LEGACY_MEAL_SERVICE");
  const view = presentLocationRunOperation({
    cycles,
    timings: [],
    now: at("10:30"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: NAVAL,
    location: NAVAL_LOCATION,
    nowLocalHhMm: "10:30",
  });
  assert.equal(view.keyTimes.length, 0);
});

test("product proof: Naval Park Servery at 10:30 / 12:00 / 13:45 / 14:01", () => {
  const t1030 = serializeLocationRunProof(presentAt("10:30"));
  assert.deepEqual(t1030, {
    provenance: "NEW_PERIOD_KEY_TIME",
    title: "Naval Park Servery",
    roomTypeLabel: "Servery",
    current: "Lunch → Prep",
    window: "10:00 AM–11:30 AM",
    keyTimes: [{ label: "1st Round Lunch Due", due: "12:00 PM", status: "upcoming" }],
    attentionKind: "upcoming",
  });

  const t1200 = serializeLocationRunProof(presentAt("12:00"));
  assert.deepEqual(t1200, {
    provenance: "NEW_PERIOD_KEY_TIME",
    title: "Naval Park Servery",
    roomTypeLabel: "Servery",
    current: "Lunch",
    window: "10:00 AM–2:00 PM",
    keyTimes: [{ label: "1st Round Lunch Due", due: "12:00 PM", status: "due" }],
    attentionKind: "needs_attention",
  });
  assert.notEqual(t1200.current, "Lunch → Prep");

  const t1345 = serializeLocationRunProof(presentAt("13:45"));
  assert.deepEqual(t1345, {
    provenance: "NEW_PERIOD_KEY_TIME",
    title: "Naval Park Servery",
    roomTypeLabel: "Servery",
    current: "Lunch → Cleanup",
    window: "1:30 PM–2:00 PM",
    keyTimes: [{ label: "1st Round Lunch Due", due: "12:00 PM", status: "overdue" }],
    attentionKind: "needs_attention",
  });

  const t1401 = serializeLocationRunProof(presentAt("14:01"));
  assert.equal(t1401.current, null);
  assert.equal(t1401.window, null);
  assert.equal(t1401.keyTimes[0]?.status, "overdue");
});

test("new-model presentation never emits legacy meal-service copy", () => {
  for (const clock of ["10:30", "12:00", "13:45", "14:01"] as const) {
    const view = presentAt(clock);
    const blob = JSON.stringify(serializeLocationRunProof(view));
    assert.equal(
      presentationContainsLegacyMealCopy(blob),
      false,
      `legacy copy leaked at ${clock}: ${blob}`,
    );
    assert.equal(presentationContainsLegacyMealCopy(view.attention.description), false);
    assert.equal(presentationContainsLegacyMealCopy(view.attention.title), false);
  }
});

test("Key Time is never the current operation", () => {
  const view = presentAt("12:00");
  assert.equal(view.currentOperation.hierarchyLabel, "Lunch");
  assert.notEqual(view.currentOperation.hierarchyLabel, "1st Round Lunch Due");
  assert.equal(view.keyTimes[0]?.label, "1st Round Lunch Due");
});

test("Prep is inactive outside its own window even while Lunch parent is active", () => {
  const view = presentAt("12:00");
  assert.equal(view.currentOperation.hierarchyLabel, "Lunch");
  assert.match(view.currentOperation.windowLabel ?? "", /10:00 AM/);
});

test("after Lunch ends, current operation is empty", () => {
  const view = presentAt("14:01");
  assert.equal(view.currentOperation.state, "NONE");
  assert.equal(view.currentOperation.hierarchyLabel, null);
});

test("Lighthouse is not in scope when only Naval Park is selected", () => {
  const view = presentLocationRunOperation({
    cycles: lunchHierarchy([NAVAL]),
    timings: [
      navalTiming(),
      navalTiming({
        expectationId: "exp-lh",
        spaceId: LIGHTHOUSE,
        spaceName: "Lighthouse Servery",
      }),
    ],
    now: at("10:30"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: LIGHTHOUSE,
    location: {
      title: "Lighthouse Servery",
      roomTypeLabel: "Servery",
      contextLabel: "1B – Lighthouse · Floor 1",
      spaceId: LIGHTHOUSE,
      unitId: "unit-1b",
    },
    nowLocalHhMm: "10:30",
  });
  assert.equal(view.currentOperation.state, "NONE");
  assert.equal(view.keyTimes.length, 0);
});

test("new Room without Key Time selection does not receive Lunch Due", () => {
  const view = presentLocationRunOperation({
    cycles: lunchHierarchy([NAVAL]),
    timings: [navalTiming()],
    now: at("12:00"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: "brand-new-room",
    location: {
      title: "New Room",
      roomTypeLabel: "Servery",
      contextLabel: "1A – Naval Park · Floor 1",
      spaceId: "brand-new-room",
      unitId: "unit-1a",
    },
    nowLocalHhMm: "12:00",
  });
  assert.equal(view.keyTimes.length, 0);
  assert.equal(view.currentOperation.state, "NONE");
});

test("EVS generic Key Time has no meal-service copy", () => {
  const cycles = [
    cycle({
      stableKey: "morning",
      label: "Morning Operations",
      startLocal: "07:00",
      endLocal: "11:00",
      spaceIds: ["room-32a"],
    }),
    cycle({
      stableKey: "rooms_complete",
      label: "Resident Rooms Complete",
      parentStableKey: "morning",
      nodeKind: "KEY_TIME",
      startLocal: null,
      endLocal: null,
      keyTimeGroups: [{ id: "g-rooms", dueLocal: "10:00", spaceIds: ["room-32a"] }],
    }),
  ];
  const view = presentLocationRunOperation({
    cycles,
    timings: [
      navalTiming({
        expectationId: "exp-evs",
        spaceId: "room-32a",
        spaceName: "Room 32A",
        facilityRoomTypeName: "Resident Room",
        cycleId: "rooms_complete",
        cycleStableKey: "rooms_complete",
        cycleLabel: "Resident Rooms Complete",
        parentCycleLabel: "Morning Operations",
        displayPath: "Morning Operations → Resident Rooms Complete",
        keyTimeGroupId: "g-rooms",
        configuredDueLocal: "10:00",
        expectedToday: "10:00",
      }),
    ],
    now: at("08:00"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: "room-32a",
    location: {
      title: "Room 32A",
      roomTypeLabel: "Resident Room",
      contextLabel: "1A – Naval Park · Floor 1",
      spaceId: "room-32a",
      unitId: "unit-1a",
    },
    nowLocalHhMm: "08:00",
  });
  assert.equal(view.currentOperation.hierarchyLabel, "Morning Operations");
  assert.equal(view.keyTimes[0]?.label, "Resident Rooms Complete");
  const blob = JSON.stringify(serializeLocationRunProof(view));
  assert.equal(presentationContainsLegacyMealCopy(blob), false);
  assert.doesNotMatch(blob, /meal period|meal service|servery|SERVICE_STARTED/i);
});

test("Today's Work department summary groups Prep rooms and Key Time progress", () => {
  const rooms = [NAVAL, "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"];
  const timings = rooms.map((spaceId, index) =>
    navalTiming({
      expectationId: `exp-${index}`,
      spaceId,
      spaceName: spaceId,
    }),
  );
  const dept = presentDepartmentRunOperation({
    cycles: lunchHierarchy(rooms),
    timings,
    now: at("10:30"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    nowLocalHhMm: "10:30",
  });
  assert.equal(dept.provenance, "NEW_PERIOD_KEY_TIME");
  assert.equal(dept.currentOperations.length, 1);
  assert.equal(dept.currentOperations[0]?.parentLabel, "Lunch");
  assert.deepEqual(
    dept.currentOperations[0]?.phases.map((phase) => phase.label),
    ["Prep"],
  );
  assert.equal(dept.currentOperations[0]?.phases[0]?.roomCount, 9);
  assert.equal(dept.keyTimeSummaries[0]?.label, "1st Round Lunch Due");
  assert.equal(dept.keyTimeSummaries[0]?.total, 9);
  assert.equal(dept.keyTimeSummaries[0]?.completed, 0);
  assert.equal(dept.keyTimeSummaries[0]?.dueLabel, "12:00 PM");
});

test("Today's Work department summary respects Team Room filter", () => {
  const rooms = [NAVAL, "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"];
  const scoped = rooms.slice(0, 8);
  const timings = rooms.map((spaceId, index) =>
    navalTiming({
      expectationId: `exp-${index}`,
      spaceId,
      spaceName: spaceId,
    }),
  );
  const dept = presentDepartmentRunOperation({
    cycles: [
      ...lunchHierarchy(rooms),
      cycle({
        stableKey: "culinary_close",
        label: "Culinary Production Close",
        startLocal: "10:00",
        endLocal: "11:00",
        displaySequence: 90,
        spaceIds: ["main-kitchen"],
        expectedMilestones: [],
      }),
    ],
    timings,
    now: at("10:30"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    nowLocalHhMm: "10:30",
    spaceIdFilter: new Set(scoped),
  });
  assert.equal(dept.keyTimeSummaries[0]?.total, 8);
  assert.equal(
    dept.currentOperations.some((operation) => operation.parentLabel === "Culinary Production Close"),
    false,
  );
  assert.equal(dept.currentOperations[0]?.parentLabel, "Lunch");
  assert.equal(dept.currentOperations[0]?.phases[0]?.roomCount, 8);
});

test("Facility Room Type Servery is used, not Other", () => {
  const view = presentAt("10:30");
  assert.equal(view.location.roomTypeLabel, "Servery");
  assert.notEqual(view.location.roomTypeLabel, "Other");
  assert.equal(view.location.title, "Naval Park Servery");
});

function dinnerHierarchy(rooms: string[] = [NAVAL]): OperationalCycleDefinition[] {
  return [
    cycle({
      stableKey: "dinner",
      label: "Dinner",
      startLocal: "15:30",
      endLocal: "20:00",
      displaySequence: 30,
      spaceIds: rooms,
      expectedMilestones: [],
    }),
    cycle({
      stableKey: "dinner_prep",
      label: "Prep",
      parentStableKey: "dinner",
      startLocal: "15:30",
      endLocal: "17:00",
      displaySequence: 31,
      locationInheritFromParent: true,
      spaceIds: [],
      expectedMilestones: [],
    }),
    cycle({
      stableKey: "dinner_due",
      label: "Dinner Due",
      parentStableKey: "dinner",
      nodeKind: "KEY_TIME",
      startLocal: null,
      endLocal: null,
      displaySequence: 32,
      keyTimeGroups: [{ id: "g-dinner-due", dueLocal: "17:00", spaceIds: rooms }],
    }),
    cycle({
      stableKey: "dinner_cleanup",
      label: "Cleanup",
      parentStableKey: "dinner",
      startLocal: "19:00",
      endLocal: "20:00",
      displaySequence: 33,
      locationInheritFromParent: true,
      spaceIds: [],
      expectedMilestones: [],
    }),
  ];
}

function dinnerTiming(partial: Partial<KeyTimeDayTiming> = {}): KeyTimeDayTiming {
  return navalTiming({
    cycleId: "dinner_due",
    cycleStableKey: "dinner_due",
    cycleLabel: "Dinner Due",
    parentCycleLabel: "Dinner",
    displayPath: "Dinner → Dinner Due",
    keyTimeGroupId: "g-dinner-due",
    configuredDueLocal: "17:00",
    expectedToday: "17:00",
    ...partial,
  });
}

function presentDinnerAt(hhMm: string, spaceId = NAVAL, rooms: string[] = [NAVAL]) {
  return presentLocationRunOperation({
    cycles: dinnerHierarchy(rooms),
    timings: [dinnerTiming({ spaceId })],
    now: at(hhMm),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId,
    location: NAVAL_LOCATION,
    nowLocalHhMm: hhMm,
  });
}

test("Dinner fixture: 16:17 Prep active, Dinner Due upcoming; 17:01 Prep off; 19:15 Cleanup; 20:01 none", () => {
  const t1617 = serializeLocationRunProof(presentDinnerAt("16:17"));
  assert.deepEqual(t1617, {
    provenance: "NEW_PERIOD_KEY_TIME",
    title: "Naval Park Servery",
    roomTypeLabel: "Servery",
    current: "Dinner → Prep",
    window: "3:30 PM–5:00 PM",
    keyTimes: [{ label: "Dinner Due", due: "5:00 PM", status: "upcoming" }],
    attentionKind: "upcoming",
  });
  assert.equal(presentationContainsLegacyMealCopy(JSON.stringify(t1617)), false);

  const t1701 = serializeLocationRunProof(presentDinnerAt("17:01"));
  assert.equal(t1701.current, "Dinner");
  assert.notEqual(t1701.current, "Dinner → Prep");
  assert.equal(t1701.keyTimes[0]?.status, "overdue");
  assert.equal(t1701.attentionKind, "needs_attention");

  const t1915 = serializeLocationRunProof(presentDinnerAt("19:15"));
  assert.equal(t1915.current, "Dinner → Cleanup");
  assert.equal(t1915.window, "7:00 PM–8:00 PM");

  const t2001 = serializeLocationRunProof(presentDinnerAt("20:01"));
  assert.equal(t2001.current, null);
  assert.equal(t2001.window, null);
});

test("inherited Prep applies to Naval Park; explicit Main Kitchen Prep does not", () => {
  const mainKitchen = "main-kitchen";
  const cycles = [
    ...dinnerHierarchy([NAVAL]),
    cycle({
      stableKey: "mk_prep",
      label: "Main Kitchen Prep",
      parentStableKey: "dinner",
      startLocal: "15:30",
      endLocal: "17:00",
      displaySequence: 34,
      locationInheritFromParent: false,
      spaceIds: [mainKitchen],
      expectedMilestones: [],
    }),
  ];
  const naval = presentLocationRunOperation({
    cycles,
    timings: [dinnerTiming()],
    now: at("16:17"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: NAVAL,
    location: NAVAL_LOCATION,
    nowLocalHhMm: "16:17",
  });
  assert.equal(naval.currentOperation.hierarchyLabel, "Dinner → Prep");
  assert.notEqual(naval.currentOperation.hierarchyLabel, "Dinner → Main Kitchen Prep");

  const kitchen = presentLocationRunOperation({
    cycles,
    timings: [dinnerTiming({ spaceId: mainKitchen })],
    now: at("16:17"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: mainKitchen,
    location: {
      title: "Main Kitchen",
      roomTypeLabel: "Kitchen",
      contextLabel: "Floor 1",
      spaceId: mainKitchen,
      unitId: "unit-kitchen",
    },
    nowLocalHhMm: "16:17",
  });
  assert.equal(kitchen.currentOperation.hierarchyLabel, "Dinner → Main Kitchen Prep");
});

test("Erie Basin is not in Dinner Due group so Key Time is omitted", () => {
  const view = presentLocationRunOperation({
    cycles: dinnerHierarchy([NAVAL]),
    timings: [
      dinnerTiming(),
      dinnerTiming({
        expectationId: "exp-erie",
        spaceId: "erie-basin",
        spaceName: "Erie Basin Servery",
      }),
    ],
    now: at("16:17"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: "erie-basin",
    location: {
      title: "Erie Basin Servery",
      roomTypeLabel: "Servery",
      contextLabel: "1C – Erie Basin · Floor 1",
      spaceId: "erie-basin",
      unitId: "unit-1c",
    },
    nowLocalHhMm: "16:17",
  });
  assert.equal(view.keyTimes.length, 0);
});

test("Next Work attention titles are Upcoming / Needs attention, never servery milestones", () => {
  const upcoming = presentDinnerAt("16:17");
  assert.equal(upcoming.attention.title, "Upcoming");
  assert.equal(upcoming.attention.description, "Dinner Due · 5:00 PM");
  assert.equal(presentationContainsLegacyMealCopy(upcoming.attention.description), false);

  const overdue = presentDinnerAt("17:05");
  assert.equal(overdue.attention.title, "Needs attention");
  assert.match(overdue.attention.description, /Dinner Due · overdue 5 min/i);
});

test("stale Key Time rows from a retired cycle version are not presented", () => {
  const view = presentLocationRunOperation({
    cycles: lunchHierarchy(),
    timings: [
      navalTiming({
        cycleId: "old-lunch-due-version",
        cycleLabel: "Stale Lunch Due",
      }),
    ],
    now: at("12:00"),
    facilityTimezone: TZ,
    operationalDateKey: DATE_KEY,
    spaceId: NAVAL,
    location: NAVAL_LOCATION,
    nowLocalHhMm: "12:00",
  });
  assert.equal(view.keyTimes.length, 0);
});

test("selectCurrentDayKeyTimeGroups counts published membership and actual completion", () => {
  const rooms = Array.from({ length: 9 }, (_, i) => `room-${i + 1}`);
  const timings = rooms.map((spaceId, index) =>
    dinnerTiming({
      spaceId,
      actualDueLocal: index === 0 ? "17:21" : null,
      expectedToday: index === 0 ? "17:10" : "17:00",
      adjustedDueLocal: index === 0 ? "17:10" : null,
    }),
  );
  const groups = selectCurrentDayKeyTimeGroups(dinnerHierarchy(rooms), timings, "17:24");
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.total, 9);
  assert.equal(groups[0]?.completed, 1);
  assert.equal(groups[0]?.overdue, 8);
});

test("selectCurrentDayKeyTimeGroups keeps total at membership when one expectation row is missing", () => {
  const rooms = Array.from({ length: 9 }, (_, i) => `room-${i + 1}`);
  const timings = rooms.slice(0, 8).map((spaceId) => dinnerTiming({ spaceId }));
  const groups = selectCurrentDayKeyTimeGroups(dinnerHierarchy(rooms), timings, "17:24");
  assert.equal(groups[0]?.total, 9);
  assert.equal(groups[0]?.missingSpaceIds.length, 1);
  assert.equal(groups[0]?.overdue, 9);
});

test("selectCurrentDayKeyTimeGroups uses adjusted time for overdue threshold", () => {
  const groups = selectCurrentDayKeyTimeGroups(
    dinnerHierarchy(["room-a", "room-b"]),
    [
      dinnerTiming({ spaceId: "room-a", adjustedDueLocal: "17:10", expectedToday: "17:10" }),
      dinnerTiming({ spaceId: "room-b" }),
    ],
    "17:05",
  );
  assert.equal(groups[0]?.overdue, 1);
});

test("selectCurrentDayKeyTimeGroups treats completed-late rows as complete not overdue", () => {
  const groups = selectCurrentDayKeyTimeGroups(
    dinnerHierarchy([NAVAL]),
    [
      dinnerTiming({
        spaceId: NAVAL,
        adjustedDueLocal: "17:10",
        expectedToday: "17:10",
        actualDueLocal: "17:21",
      }),
    ],
    "17:24",
  );
  assert.equal(groups[0]?.completed, 1);
  assert.equal(groups[0]?.overdue, 0);
});

test("selectCurrentDayKeyTimeGroups ignores superseded retired cycle version rows", () => {
  const rooms = [NAVAL];
  const cycles = [
    ...dinnerHierarchy(rooms),
    cycle({
      id: "dinner_due_v1",
      stableKey: "dinner_due",
      label: "Dinner Due",
      parentStableKey: "dinner",
      nodeKind: "KEY_TIME",
      startLocal: null,
      endLocal: null,
      status: "RETIRED",
      version: 1,
      keyTimeGroups: [{ id: "g-old", dueLocal: "17:00", spaceIds: rooms }],
    }),
  ];
  const groups = selectCurrentDayKeyTimeGroups(
    cycles,
    [
      dinnerTiming({
        cycleId: "dinner_due_v1",
        keyTimeGroupId: "g-old",
        actualDueLocal: "17:21",
      }),
      dinnerTiming({ spaceId: NAVAL }),
    ],
    "17:24",
  );
  assert.equal(groups[0]?.completed, 0);
  assert.equal(groups[0]?.overdue, 1);
});
