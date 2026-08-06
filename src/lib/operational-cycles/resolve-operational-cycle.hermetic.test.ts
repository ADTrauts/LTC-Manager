import assert from "node:assert/strict";
import test from "node:test";

import { resolveOperationalCycle } from "./resolve-operational-cycle";
import type { OperationalCycleDefinition } from "./types";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function cycle(
  overrides: Partial<OperationalCycleDefinition> & Pick<OperationalCycleDefinition, "id" | "label" | "startLocal" | "endLocal">,
): OperationalCycleDefinition {
  return {
    stableKey: overrides.stableKey ?? overrides.id,
    version: 1,
    description: null,
    cycleType: "SERVICE",
    displaySequence: 100,
    overnight: false,
    applicableDaysOfWeek: ALL_DAYS,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    mealType: "BREAKFAST",
    locationMode: "ALL_DEPARTMENT_UNITS",
    applicableUnitTypes: [],
    expectedMilestones: ["READY", "SERVICE_STARTED"],
    status: "PUBLISHED",
    unitIds: [],
    ...overrides,
  };
}

test("no published cycles yields NOT_CONFIGURED", () => {
  const ctx = resolveOperationalCycle({
    cycles: [],
    now: new Date("2026-08-06T12:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "NOT_CONFIGURED");
  if (ctx.state === "NOT_CONFIGURED") {
    assert.equal(ctx.reason, "NO_PUBLISHED_CYCLES");
  }
});

test("drafts are ignored for runtime", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "d1",
        label: "Draft Breakfast",
        startLocal: "07:00",
        endLocal: "09:00",
        status: "DRAFT",
      }),
    ],
    now: new Date("2026-08-06T11:30:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "NOT_CONFIGURED");
});

test("unit not in location scope yields NOT_APPLICABLE", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "c1",
        label: "Breakfast",
        startLocal: "07:00",
        endLocal: "09:00",
        locationMode: "UNIT_TYPES",
        applicableUnitTypes: ["SERVERY"],
      }),
    ],
    now: new Date("2026-08-06T11:30:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
    unit: { id: "u1", unitType: "RESIDENT_AREA" },
  });
  assert.equal(ctx.state, "NOT_APPLICABLE");
});

test("ACTIVE primary is lowest displaySequence then stableKey then id", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "b",
        stableKey: "beta",
        label: "Beta",
        startLocal: "07:00",
        endLocal: "10:00",
        displaySequence: 20,
      }),
      cycle({
        id: "a",
        stableKey: "alpha",
        label: "Alpha",
        startLocal: "07:00",
        endLocal: "10:00",
        displaySequence: 10,
      }),
      cycle({
        id: "c",
        stableKey: "alpha",
        label: "Alpha2",
        startLocal: "07:00",
        endLocal: "10:00",
        displaySequence: 10,
      }),
    ],
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "ACTIVE");
  if (ctx.state === "ACTIVE") {
    assert.equal(ctx.primary.id, "a");
    assert.equal(ctx.activeCycles.length, 3);
  }
});

test("mealTargetTime comes from UnitMealTime input not cycle", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "c1",
        label: "Breakfast",
        startLocal: "07:00",
        endLocal: "09:00",
        mealType: "BREAKFAST",
      }),
    ],
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
    mealTargets: [{ mealType: "BREAKFAST", scheduledTime: "07:45" }],
  });
  assert.equal(ctx.state, "ACTIVE");
  if (ctx.state === "ACTIVE") {
    assert.equal(ctx.mealTargetTime, "07:45");
  }
});

test("does not invent Breakfast when no cycles", () => {
  const ctx = resolveOperationalCycle({
    cycles: [],
    now: new Date("2026-08-06T08:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "NOT_CONFIGURED");
  assert.ok(!("primary" in ctx));
  assert.ok(!("next" in ctx && ctx.state !== "NOT_CONFIGURED"));
});

test("UPCOMING BEFORE first cycle", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "c1",
        label: "Lunch",
        startLocal: "11:30",
        endLocal: "13:30",
        mealType: "LUNCH",
      }),
    ],
    now: new Date("2026-08-06T10:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "UPCOMING");
  if (ctx.state === "UPCOMING") {
    assert.equal(ctx.next.label, "Lunch");
    assert.ok(ctx.minutesUntilNext > 0);
  }
});

test("DAY_COMPLETE after last cycle", () => {
  const ctx = resolveOperationalCycle({
    cycles: [
      cycle({
        id: "c1",
        label: "Breakfast",
        startLocal: "07:00",
        endLocal: "09:00",
      }),
    ],
    now: new Date("2026-08-06T15:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
  assert.equal(ctx.state, "DAY_COMPLETE");
  if (ctx.state === "DAY_COMPLETE") {
    assert.equal(ctx.last.label, "Breakfast");
  }
});
