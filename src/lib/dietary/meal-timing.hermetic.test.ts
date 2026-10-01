import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { appendKeyPointActual, defaultOccurrenceTrackingForNewNode } from "@/lib/operational-cycles/cycle-canonical";
import { buildDietaryDefaultCyclePlans } from "@/lib/operational-cycles/defaults";
import { presentKeyPointRuntime } from "@/lib/operational-cycles/cycle-canonical";
import { resolveOperationalCycle } from "@/lib/operational-cycles/resolve-operational-cycle";

import {
  canonicalTimingOwnsMoment,
  occurrenceTrackingForMoment,
  presentDietaryMoment,
  selectMealTimingFacts,
} from "./meal-timing";

test("a new generic Key Point defaults to NONE and Service Started opts into REQUIRED", () => {
  assert.equal(defaultOccurrenceTrackingForNewNode("KEY_TIME"), "NONE");
  assert.equal(occurrenceTrackingForMoment("due"), "NONE");
  assert.equal(occurrenceTrackingForMoment("service_started"), "REQUIRED");
  assert.equal(occurrenceTrackingForMoment("ready"), "REQUIRED");
  const plans = buildDietaryDefaultCyclePlans();
  for (const meal of ["breakfast", "lunch", "dinner"] as const) {
    const due = plans.find((plan) => plan.stableKey === `${meal}_due`);
    const ready = plans.find((plan) => plan.stableKey === `${meal}_ready`);
    const started = plans.find((plan) => plan.stableKey === `${meal}_service_started`);
    assert.equal(due?.occurrenceTracking, "NONE");
    assert.equal(due?.keyPointGrain, "DEPARTMENT");
    assert.equal(ready?.occurrenceTracking, "REQUIRED");
    assert.equal(ready?.keyPointGrain, "LOCATION");
    assert.deepEqual(ready?.applicableOperationalTypeKeys, ["food_service_area"]);
    assert.equal(started?.occurrenceTracking, "REQUIRED");
    assert.equal(started?.keyPointGrain, "LOCATION");
    assert.equal(started?.mealType, null);
    assert.deepEqual(started?.expectedMilestones, []);
  }
});

test("Meal Due shows planned and adjusted time and does not require an actual", () => {
  const view = presentDietaryMoment({
    moment: "due",
    plannedDueLocal: "08:00",
    adjustedDueLocal: "08:15",
    nowLocal: "09:00",
    actuals: [{ id: "should-ignore", actualLocal: "08:17", recordedAt: "2026-10-01T12:00:00.000Z", correctionReason: null, correctsActualId: null }],
  });
  assert.equal(view.tracking, "NONE");
  assert.equal(view.plannedLocal, "08:00");
  assert.equal(view.adjustedLocal, "08:15");
  assert.equal(view.actualLocal, null);
  assert.equal(view.requiresActual, false);
  assert.equal(view.state, "past");
});

test("Service Started is location grain, sparse, and correctable", () => {
  const naval = presentDietaryMoment({
    moment: "service_started",
    plannedDueLocal: "08:00",
    nowLocal: "08:30",
  });
  const lighthouse = presentDietaryMoment({
    moment: "service_started",
    plannedDueLocal: "08:00",
    adjustedDueLocal: "08:15",
    nowLocal: "08:30",
    actuals: [
      {
        id: "a1",
        actualLocal: "08:17",
        recordedAt: "2026-10-01T12:20:00.000Z",
        correctionReason: null,
        correctsActualId: null,
      },
    ],
  });
  assert.equal(naval.actualLocal, null);
  assert.equal(naval.state, "absent");
  assert.equal(naval.requiresActual, true);
  assert.equal(lighthouse.plannedLocal, "08:00");
  assert.equal(lighthouse.adjustedLocal, "08:15");
  assert.equal(lighthouse.actualLocal, "08:17");
  assert.equal(lighthouse.recordedAt, "2026-10-01T12:20:00.000Z");
  const corrected = appendKeyPointActual({
    existing: [
      {
        id: "a1",
        actualLocal: "08:17",
        recordedAt: "2026-10-01T12:20:00.000Z",
        correctionReason: null,
        correctsActualId: null,
      },
    ],
    id: "a2",
    actualLocal: "08:05",
    recordedAt: "2026-10-01T12:40:00.000Z",
    correctionReason: "entry error",
  });
  assert.equal(corrected.ok, true);
  if (corrected.ok) {
    assert.equal(corrected.facts[0]?.actualLocal, "08:17");
    assert.equal(corrected.facts[1]?.actualLocal, "08:05");
    assert.equal(corrected.facts[1]?.correctsActualId, "a1");
    const current = presentKeyPointRuntime({
      tracking: "REQUIRED",
      plannedDueLocal: "08:00",
      nowLocal: "08:30",
      actuals: corrected.facts,
    });
    assert.equal(current.actualLocal, "08:05");
    assert.equal(current.originalActualLocal, "08:17");
  }
});

test("legacy READY and SERVICE_STARTED stay readable until a canonical Key Point owns that operation", () => {
  const legacy = [
    { milestone: "READY" as const, occurredAt: "08:02" },
    { milestone: "SERVICE_STARTED" as const, occurredAt: "08:07" },
  ];
  const legacyCycles = [
    {
      stableKey: "breakfast",
      nodeKind: "PERIOD" as const,
      mealType: "BREAKFAST",
      expectedMilestones: ["READY", "SERVICE_STARTED"],
      parentStableKey: null,
    },
  ];
  const historical = selectMealTimingFacts({
    mealType: "BREAKFAST",
    eventType: "STARTED",
    effectiveCycles: legacyCycles,
    canonical: [],
    legacy,
  });
  assert.equal(historical.model, "LEGACY_MILESTONES");
  assert.equal(historical.legacy.length, 2);
  assert.equal(historical.canonical.length, 0);
  const forward = selectMealTimingFacts({
    mealType: "BREAKFAST",
    eventType: "STARTED",
    effectiveCycles: [
      ...legacyCycles,
      { stableKey: "breakfast_service_started", nodeKind: "KEY_TIME" as const },
    ],
    canonical: [{ stableKey: "breakfast_service_started", actualLocal: "08:07" }],
    legacy,
  });
  assert.equal(forward.model, "CANONICAL_KEY_POINTS");
  assert.deepEqual(forward.legacy, []);
  assert.equal(forward.canonical.length, 1);
  assert.equal(
    canonicalTimingOwnsMoment({
      cycles: [{ stableKey: "breakfast_service_started", nodeKind: "KEY_TIME" }],
      mealType: "BREAKFAST",
      milestone: "SERVICE_STARTED",
    }),
    true,
  );
  assert.equal(
    canonicalTimingOwnsMoment({
      cycles: [{ stableKey: "breakfast_service_started", nodeKind: "KEY_TIME" }],
      mealType: "BREAKFAST",
      milestone: "READY",
    }),
    false,
  );
});

test("shared Cycle resolution does not need MealType or UnitMealTime", () => {
  const resolved = resolveOperationalCycle({
    cycles: [
      {
        id: "breakfast",
        stableKey: "breakfast",
        parentStableKey: null,
        nodeKind: "PERIOD",
        label: "Breakfast",
        cycleType: "CUSTOM",
        status: "PUBLISHED",
        version: 1,
        displaySequence: 10,
        startLocal: "05:30",
        endLocal: "10:00",
        overnight: false,
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        description: null,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        effectiveTo: null,
        mealType: null,
        expectedMilestones: [],
        locationMode: "ALL_DEPARTMENT_UNITS",
        locationInheritFromParent: false,
        applicableUnitTypes: [],
        applicableOperationalTypeKeys: [],
        unitIds: [],
        spaceIds: [],
        roomTypeKey: null,
        milestoneTimes: [],
        keyTimeGroups: [],
      },
    ],
    now: new Date("2026-10-01T08:00:00.000Z"),
    facilityTimezone: "UTC",
    operationalDateKey: "2026-10-01",
    unit: null,
    mealTargets: [],
  });
  assert.equal(resolved.state, "ACTIVE");
  if (resolved.state === "ACTIVE") {
    assert.ok(resolved.activeCycles.some((cycle) => cycle.stableKey === "breakfast"));
    assert.equal(resolved.mealTargetTime, null);
  }
});

test("forward Dietary timing writers do not call the legacy milestone writer", () => {
  const files = [
    "src/lib/dietary/record-meal-timing.ts",
    "src/app/(protected)/unit/[unitId]/actions.ts",
    "src/app/(protected)/unit/[unitId]/offline-actions.ts",
    "src/lib/offline/process-sync-command.ts",
    "src/lib/dietary/route-meal-timing.ts",
  ];
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    if (file.endsWith("route-meal-timing.ts")) {
      assert.match(source, /recordServeryMilestone/);
      assert.match(source, /recordDietaryMealTiming/);
      const canonicalBranch = source.split('target === "canonical"')[1]?.split('target === "legacy"')[0] ?? "";
      const legacyBranch = source.split('target === "legacy"')[1] ?? "";
      assert.match(canonicalBranch, /recordDietaryMealTiming/);
      assert.doesNotMatch(canonicalBranch, /recordServeryMilestone/);
      assert.match(legacyBranch, /recordServeryMilestone/);
      assert.doesNotMatch(legacyBranch, /recordDietaryMealTiming/);
      continue;
    }
    assert.doesNotMatch(source, /recordServeryMilestone/);
    assert.doesNotMatch(source, /serveryMealServiceEvent/);
    assert.doesNotMatch(source, /serveryMilestoneEntry/);
    assert.doesNotMatch(source, /operationalCycleDayExpectation\.create/);
  }
  const staffing = readFileSync(
    join(process.cwd(), "src/app/(protected)/staffing/cycles/actions.ts"),
    "utf8",
  );
  assert.match(staffing, /A reason is required to adjust operational timing/);
  assert.doesNotMatch(staffing, /adjustKeyTimeDayExpectation/);
  assert.doesNotMatch(staffing, /adjustMealServiceDayExpectation/);
  const page = readFileSync(
    join(process.cwd(), "src/app/(protected)/staffing/cycles/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(page, /delay-key-time-plus-5/);
  assert.doesNotMatch(page, /delay-meal-plus-5/);
});
