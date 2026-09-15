import assert from "node:assert/strict";
import test from "node:test";

import {
  findOverlappingPublishedCycles,
  validateCycle,
  validateCycleForPublish,
} from "./validate-cycle";

test("label start end and days are required", () => {
  const result = validateCycle({
    label: "",
    cycleType: "PREPARATION",
    startLocal: "",
    endLocal: "",
    applicableDaysOfWeek: [],
    effectiveFrom: null,
    locationMode: "ALL_DEPARTMENT_UNITS",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "label_required"));
  assert.ok(result.errors.some((e) => e.code === "start_required"));
  assert.ok(result.errors.some((e) => e.code === "end_required"));
  assert.ok(result.errors.some((e) => e.code === "days_required"));
  assert.ok(result.errors.some((e) => e.code === "effective_from_required"));
});

test("end before start without overnight is error", () => {
  const result = validateCycle({
    label: "Night",
    cycleType: "CUSTOM",
    startLocal: "22:00",
    endLocal: "06:00",
    overnight: false,
    applicableDaysOfWeek: [1],
    effectiveFrom: "2026-08-01",
    locationMode: "ALL_DEPARTMENT_UNITS",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "end_before_start"));
});

test("SERVICE without mealType warns on draft and errors on publish", () => {
  const draft = validateCycle({
    label: "Breakfast",
    cycleType: "SERVICE",
    startLocal: "07:00",
    endLocal: "09:00",
    applicableDaysOfWeek: [1],
    effectiveFrom: "2026-08-01",
    locationMode: "ALL_DEPARTMENT_UNITS",
  });
  assert.equal(draft.valid, true);
  assert.ok(draft.warnings.some((w) => w.code === "service_meal_missing"));

  const publish = validateCycle({
    label: "Breakfast",
    cycleType: "SERVICE",
    startLocal: "07:00",
    endLocal: "09:00",
    applicableDaysOfWeek: [1],
    effectiveFrom: "2026-08-01",
    locationMode: "ALL_DEPARTMENT_UNITS",
    forPublish: true,
  });
  assert.equal(publish.valid, false);
  assert.ok(publish.errors.some((e) => e.code === "service_meal_required"));
});

test("EXPLICIT_UNITS and UNIT_TYPES require selections", () => {
  const explicitDraft = validateCycle({
    label: "Prep",
    cycleType: "PREPARATION",
    startLocal: "05:00",
    endLocal: "07:00",
    applicableDaysOfWeek: [1],
    effectiveFrom: "2026-08-01",
    locationMode: "EXPLICIT_UNITS",
    unitIds: [],
  });
  assert.equal(explicitDraft.valid, true);
  assert.ok(explicitDraft.warnings.some((w) => w.code === "explicit_locations_empty"));

  const explicitPublish = validateCycle({
    label: "Prep",
    cycleType: "PREPARATION",
    startLocal: "05:00",
    endLocal: "07:00",
    applicableDaysOfWeek: [1],
    effectiveFrom: "2026-08-01",
    locationMode: "EXPLICIT_UNITS",
    unitIds: [],
    forPublish: true,
  });
  assert.ok(explicitPublish.errors.some((e) => e.code === "explicit_locations_required"));

  const types = validateCycle({
    label: "Prep",
    cycleType: "PREPARATION",
    startLocal: "05:00",
    endLocal: "07:00",
    applicableDaysOfWeek: [1],
    effectiveFrom: "2026-08-01",
    locationMode: "UNIT_TYPES",
    applicableUnitTypes: [],
  });
  assert.ok(types.errors.some((e) => e.code === "unit_types_required"));
});

test("same stableKey peers are ignored for publish overlap", () => {
  const peers = [
    {
      id: "prior",
      label: "Dinner v1",
      startLocal: "17:00",
      endLocal: "19:00",
      overnight: false,
      applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      locationMode: "ALL_DEPARTMENT_UNITS" as const,
      applicableUnitTypes: [],
      unitIds: [],
      effectiveFrom: "2026-08-01",
      effectiveTo: null,
      stableKey: "dinner",
    },
  ];
  const result = validateCycleForPublish(
    {
      label: "Dinner",
      cycleType: "SERVICE",
      startLocal: "17:15",
      endLocal: "19:00",
      applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      effectiveFrom: "2026-08-11",
      mealType: "DINNER",
      locationMode: "ALL_DEPARTMENT_UNITS",
      expectedMilestones: ["READY"],
      stableKey: "dinner",
    },
    peers,
    "UTC",
  );
  assert.equal(result.valid, true);
});

test("distinct published cycles may overlap in clock time", () => {
  const peers = [
    {
      id: "p1",
      label: "Morning Prep",
      startLocal: "05:30",
      endLocal: "07:10",
      overnight: false,
      applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      locationMode: "ALL_DEPARTMENT_UNITS" as const,
      applicableUnitTypes: [],
      unitIds: [],
      stableKey: "morning_prep",
    },
  ];
  const result = validateCycleForPublish(
    {
      label: "Breakfast Service",
      cycleType: "SERVICE",
      startLocal: "07:00",
      endLocal: "09:00",
      overnight: false,
      applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      effectiveFrom: "2026-08-01",
      mealType: "BREAKFAST",
      locationMode: "ALL_DEPARTMENT_UNITS",
      stableKey: "breakfast_service",
    },
    peers,
    "UTC",
  );
  assert.equal(result.valid, true);
  assert.equal(result.errors.some((e) => e.code === "overlap_published"), false);
  assert.ok(result.warnings.some((w) => w.code === "overlap_published"));
});

test("Kitchen and Servery scoped cycles can coexist even with overlapping times", () => {
  const result = validateCycleForPublish(
    {
      label: "Breakfast Production",
      cycleType: "PREPARATION",
      startLocal: "05:30",
      endLocal: "08:00",
      overnight: false,
      applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      effectiveFrom: "2026-08-01",
      locationMode: "EXPLICIT_UNITS",
      unitIds: [],
      spaceIds: ["main-kitchen"],
      stableKey: "breakfast_production",
    },
    [
      {
        id: "servery",
        label: "Breakfast Service",
        startLocal: "07:00",
        endLocal: "09:00",
        overnight: false,
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        locationMode: "ROOM_TYPE",
        applicableUnitTypes: [],
        unitIds: [],
        stableKey: "breakfast_service",
      },
    ],
    "UTC",
  );
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("Retail and Servery scoped cycles can coexist", () => {
  const result = validateCycleForPublish(
    {
      label: "Retail Breakfast",
      cycleType: "SERVICE",
      startLocal: "07:00",
      endLocal: "10:00",
      overnight: false,
      applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      effectiveFrom: "2026-08-01",
      mealType: "BREAKFAST",
      locationMode: "EXPLICIT_UNITS",
      unitIds: [],
      spaceIds: ["retail"],
      stableKey: "retail_breakfast",
    },
    [
      {
        id: "servery",
        label: "Breakfast Service",
        startLocal: "07:00",
        endLocal: "09:00",
        overnight: false,
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        locationMode: "ROOM_TYPE",
        applicableUnitTypes: [],
        unitIds: [],
        stableKey: "breakfast_service",
      },
    ],
    "UTC",
  );
  assert.equal(result.valid, true);
});

test("findOverlappingPublishedCycles ignores overnight peers", () => {
  const overlaps = findOverlappingPublishedCycles(
    {
      id: "c1",
      label: "Day",
      startLocal: "07:00",
      endLocal: "09:00",
      overnight: false,
      applicableDaysOfWeek: [1],
      locationMode: "ALL_DEPARTMENT_UNITS",
      applicableUnitTypes: [],
      unitIds: [],
    },
    [
      {
        id: "c2",
        label: "Night",
        startLocal: "22:00",
        endLocal: "06:00",
        overnight: true,
        applicableDaysOfWeek: [1],
        locationMode: "ALL_DEPARTMENT_UNITS",
        applicableUnitTypes: [],
        unitIds: [],
      },
    ],
    "UTC",
  );
  assert.equal(overlaps.length, 0);
});

test("ROOM_TYPE scope requires a standard Facility Room Type when legacy key is set", () => {
  const custom = validateCycle({
    label: "Breakfast Service",
    cycleType: "SERVICE",
    startLocal: "06:45",
    endLocal: "09:00",
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: "2026-08-01",
    locationMode: "ROOM_TYPE",
    roomTypeKey: "custom:banquet",
    mealType: "BREAKFAST",
  });
  assert.equal(custom.valid, false);
  assert.ok(custom.errors.some((e) => e.code === "room_type_required"));

  const ok = validateCycle({
    label: "Breakfast Service",
    cycleType: "SERVICE",
    startLocal: "06:45",
    endLocal: "09:00",
    applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    effectiveFrom: "2026-08-01",
    locationMode: "ROOM_TYPE",
    roomTypeKey: "servery",
    mealType: "BREAKFAST",
  });
  assert.equal(ok.valid, true);
});

test("distinct scoped cycles may overlap — publish warning only", () => {
  const result = validateCycleForPublish(
    {
      label: "Breakfast Production",
      cycleType: "PREPARATION",
      startLocal: "05:30",
      endLocal: "08:30",
      applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      effectiveFrom: "2026-08-01",
      locationMode: "EXPLICIT_UNITS",
      spaceIds: ["kitchen"],
      unitIds: [],
      stableKey: "breakfast_production",
    },
    [
      {
        id: "svc",
        label: "Breakfast Service",
        startLocal: "06:45",
        endLocal: "09:00",
        overnight: false,
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        locationMode: "ROOM_TYPE",
        applicableUnitTypes: [],
        unitIds: [],
        effectiveFrom: "2026-08-01",
        effectiveTo: null,
        stableKey: "breakfast_service",
      },
    ],
    "UTC",
  );
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((w) => w.code === "overlap_published"));
});

test("validation never invents Blocked status", () => {
  const result = validateCycle({
    label: "X",
    cycleType: "CUSTOM",
    startLocal: "10:00",
    endLocal: "11:00",
    applicableDaysOfWeek: [1],
    effectiveFrom: "2026-08-01",
    locationMode: "ALL_DEPARTMENT_UNITS",
  });
  const blob = JSON.stringify(result);
  assert.doesNotMatch(blob, /Blocked/);
});
