import assert from "node:assert/strict";
import test from "node:test";

import { resolveOperationalCycle } from "@/lib/operational-cycles/resolve-operational-cycle";
import type { OperationalCycleDefinition } from "@/lib/operational-cycles/types";

import { publishedWindowFromCycleContext } from "./published-window";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function cycle(
  overrides: Partial<OperationalCycleDefinition> &
    Pick<OperationalCycleDefinition, "id" | "label" | "startLocal" | "endLocal">,
): OperationalCycleDefinition {
  return {
    stableKey: overrides.stableKey ?? overrides.id,
    nodeKind: "PERIOD",
    version: 1,
    description: null,
    cycleType: "SERVICE",
    displaySequence: 100,
    overnight: false,
    applicableDaysOfWeek: ALL_DAYS,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    mealType: null,
    locationMode: "ALL_DEPARTMENT_UNITS",
    locationInheritFromParent: false,
    applicableUnitTypes: [],
    expectedMilestones: [],
    status: "PUBLISHED",
    roomTypeKey: null,
    unitIds: [],
    spaceIds: [],
    milestoneTimes: [],
    keyTimeGroups: [],
    parentStableKey: null,
    ...overrides,
  };
}

function resolve(cycles: OperationalCycleDefinition[], nowIso: string) {
  return resolveOperationalCycle({
    cycles,
    now: new Date(nowIso),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-08-06",
  });
}

const breakfast = [
  cycle({
    id: "breakfast",
    label: "Breakfast",
    startLocal: "05:00",
    endLocal: "10:00",
    displaySequence: 10,
  }),
  cycle({
    id: "prep",
    stableKey: "breakfast_prep",
    label: "Prep",
    startLocal: "06:00",
    endLocal: "07:00",
    displaySequence: 11,
    parentStableKey: "breakfast",
    expectedMilestones: ["READY"],
  }),
  cycle({
    id: "service",
    stableKey: "breakfast_service",
    label: "Service",
    startLocal: "07:00",
    endLocal: "09:00",
    displaySequence: 12,
    parentStableKey: "breakfast",
    expectedMilestones: ["SERVICE_STARTED"],
  }),
];

test("a published phase is the window", () => {
  const window = publishedWindowFromCycleContext(
    resolve(breakfast, "2026-08-06T06:30:00.000Z"),
  );
  assert.deepEqual(window, {
    label: "Breakfast",
    phase: "Prep",
    scheduledTime: "6:00 AM–7:00 AM",
    source: "published_cycle",
  });
});

test("overlapping phases stay one Cycle without a single phase", () => {
  const window = publishedWindowFromCycleContext(
    resolve(
      breakfast.map((row) =>
        row.id === "service" ? { ...row, startLocal: "06:00", endLocal: "09:00" } : row,
      ),
      "2026-08-06T06:30:00.000Z",
    ),
  );
  assert.equal(window?.label, "Breakfast");
  assert.equal(window?.phase, null);
  assert.equal(window?.source, "published_cycle");
});

test("a Cycle with no phase names the Cycle only", () => {
  const window = publishedWindowFromCycleContext(
    resolve(
      [
        cycle({
          id: "rounds",
          label: "Morning Rounds",
          startLocal: "08:00",
          endLocal: "10:00",
          expectedMilestones: ["READY"],
        }),
      ],
      "2026-08-06T08:30:00.000Z",
    ),
  );
  assert.equal(window?.label, "Morning Rounds");
  assert.equal(window?.phase, null);
  assert.equal(window?.scheduledTime, "8:00 AM–10:00 AM");
});

test("no published Cycle and a gap between Cycles are no window", () => {
  assert.equal(
    publishedWindowFromCycleContext(resolve([], "2026-08-06T06:30:00.000Z")),
    null,
  );
  assert.equal(
    publishedWindowFromCycleContext(resolve(breakfast, "2026-08-06T12:00:00.000Z")),
    null,
  );
});
