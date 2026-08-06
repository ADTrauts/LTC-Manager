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
  const explicit = validateCycle({
    label: "Prep",
    cycleType: "PREPARATION",
    startLocal: "05:00",
    endLocal: "07:00",
    applicableDaysOfWeek: [1],
    effectiveFrom: "2026-08-01",
    locationMode: "EXPLICIT_UNITS",
    unitIds: [],
  });
  assert.ok(explicit.errors.some((e) => e.code === "explicit_units_required"));

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

test("overlapping published cycles rejected on publish", () => {
  const peers = [
    {
      id: "p1",
      label: "Breakfast A",
      startLocal: "07:00",
      endLocal: "09:00",
      overnight: false,
      applicableDaysOfWeek: [1, 2, 3, 4, 5],
      locationMode: "ALL_DEPARTMENT_UNITS" as const,
      applicableUnitTypes: [],
      unitIds: [],
    },
  ];
  const result = validateCycleForPublish(
    {
      label: "Breakfast B",
      cycleType: "SERVICE",
      startLocal: "08:00",
      endLocal: "10:00",
      overnight: false,
      applicableDaysOfWeek: [3, 4],
      effectiveFrom: "2026-08-01",
      mealType: "BREAKFAST",
      locationMode: "ALL_DEPARTMENT_UNITS",
    },
    peers,
    "UTC",
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === "overlap_published"));
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
