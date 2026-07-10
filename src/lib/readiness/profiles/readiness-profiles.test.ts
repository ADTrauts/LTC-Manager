import assert from "node:assert/strict";
import test from "node:test";

import { LogSubmissionStatus, MealType, UnitType } from "@prisma/client";

import { computeReadinessBatch } from "@/lib/readiness/compute-readiness-batch";
import { computeUnitReadiness } from "@/lib/readiness/compute-unit-readiness";
import {
  evaluateDietaryReadiness,
  evaluateEvsReadiness,
  evaluateNeutralReadiness,
  evaluatePlantReadiness,
} from "@/lib/readiness/profiles";
import { buildOperationalTimeContext } from "@/lib/operational-time";
import type { UnitReadinessSignals } from "@/lib/readiness/types";

function baseSignals(
  partial: Partial<UnitReadinessSignals> & Pick<UnitReadinessSignals, "unitId" | "unitName" | "unitType">,
): UnitReadinessSignals {
  return {
    failed: 0,
    missed: 0,
    pending: 0,
    expected: 0,
    completed: 0,
    staffingCount: 1,
    openRepairCount: 0,
    urgentRepairCount: 0,
    highRepairCount: 0,
    serveryMealNotLive: false,
    operationPhase: "Preparation",
    profileKey: "DIETARY",
    mealLabel: "Breakfast",
    primaryUrgentRepairTitle: null,
    primaryHighRepairTitle: null,
    assignedSignificantRepairCount: 0,
    unassignedUrgentOrHighCount: 0,
    overdueCriticalRepairCount: 0,
    normalPriorityOpenRepairCount: 0,
    assignedNormalRepairCount: 0,
    preventiveMaintenanceInProgressCount: 0,
    requiresEvsCoverage: false,
    ...partial,
  };
}

function breakfastTime(overrides: Partial<Parameters<typeof buildOperationalTimeContext>[0]> = {}) {
  return buildOperationalTimeContext({
    now: new Date("2026-07-08T08:00:00"),
    facilityTimezone: "America/New_York",
    mealType: MealType.BREAKFAST,
    mealLabel: "Breakfast",
    operationPhase: "Execution",
    scheduledStartLocal: "07:30",
    minutesUntilService: -30,
    ...overrides,
  });
}

test("dietary: future lunch log does not affect breakfast readiness", () => {
  const now = new Date("2026-07-08T08:00:00");
  const batch = computeReadinessBatch({
    month: 7,
    managerCount: 0,
    birthdaysThisMonth: [],
    units: [
      {
        id: "servery",
        name: "West Servery",
        unitType: UnitType.SERVERY,
        mealTimes: [
          { mealType: MealType.BREAKFAST, scheduledTime: "07:30" },
          { mealType: MealType.LUNCH, scheduledTime: "11:30" },
        ],
        departmentResponsibilities: [{ department: { key: "DIETARY" } }],
      },
    ],
    assignments: [
      {
        id: "a-breakfast",
        unitId: "servery",
        templateId: "t1",
        mealType: MealType.BREAKFAST,
        timesPerDay: 1,
        template: { name: "Breakfast temp" },
      },
      {
        id: "a-lunch",
        unitId: "servery",
        templateId: "t2",
        mealType: MealType.LUNCH,
        timesPerDay: 1,
        template: { name: "Lunch temp" },
      },
    ],
    submissionsToday: [
      {
        id: "s-breakfast",
        assignmentId: "a-breakfast",
        unitId: "servery",
        status: LogSubmissionStatus.COMPLETED,
        mealType: MealType.BREAKFAST,
      },
    ],
    scheduleEntriesToday: [{ unitId: "servery", shift: "AM" }],
    overridesToday: [],
    openRepairs: [],
    serveryMealServiceEventsToday: [
      {
        unitId: "servery",
        mealType: MealType.BREAKFAST,
        mealServiceReadyAt: new Date("2026-07-08T07:45:00"),
        mealServiceStartedAt: new Date("2026-07-08T07:50:00"),
      },
    ],
    now,
    activeDepartmentKey: "DIETARY",
    facilityTimezone: "America/New_York",
  });

  assert.equal(batch.operationContext.mealType, MealType.BREAKFAST);
  assert.equal(batch.byUnitId.get("servery")?.state, "ready");
});

test("dietary: incomplete later-day logs do not prevent Ready", () => {
  const result = evaluateDietaryReadiness({
    signals: baseSignals({
      unitId: "s1",
      unitName: "Servery",
      unitType: UnitType.SERVERY,
      pending: 0,
      expected: 1,
      completed: 1,
      staffingCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "ready");
});

test("dietary: staffed + critical current markers satisfied = Ready", () => {
  const readiness = computeUnitReadiness(
    baseSignals({
      unitId: "s1",
      unitName: "Servery",
      unitType: UnitType.SERVERY,
      expected: 1,
      completed: 1,
      staffingCount: 2,
      profileKey: "DIETARY",
    }),
    { now: new Date("2026-07-08T08:00:00"), minutesUntilService: -30 },
  );
  assert.equal(readiness.state, "ready");
});

test("dietary: active preparation work = In Progress", () => {
  const result = evaluateDietaryReadiness({
    signals: baseSignals({
      unitId: "s1",
      unitName: "Servery",
      unitType: UnitType.SERVERY,
      pending: 1,
      expected: 1,
      serveryMealNotLive: true,
      operationPhase: "Preparation",
      staffingCount: 1,
    }),
    operationalTime: breakfastTime({
      operationPhase: "Preparation",
      minutesUntilService: 20,
    }),
  });
  assert.equal(result.state, "in_progress");
  assert.match(result.primaryReason, /in progress|due now/i);
});

test("dietary: zero current-meal staffing = Needs Attention", () => {
  const result = evaluateDietaryReadiness({
    signals: baseSignals({
      unitId: "s1",
      unitName: "Servery",
      unitType: UnitType.SERVERY,
      staffingCount: 0,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "blocked");
  assert.match(result.primaryReason, /No server assigned for breakfast/i);
});

test("dietary: overdue critical current-meal log = Needs Attention", () => {
  const result = evaluateDietaryReadiness({
    signals: baseSignals({
      unitId: "s1",
      unitName: "Servery",
      unitType: UnitType.SERVERY,
      missed: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "blocked");
  assert.match(result.primaryReason, /overdue/i);
});

test("dietary: not-yet-due pending logs stay Ready", () => {
  const result = evaluateDietaryReadiness({
    signals: baseSignals({
      unitId: "s1",
      unitName: "Servery",
      unitType: UnitType.SERVERY,
      pending: 2,
      expected: 2,
      operationPhase: "Preparation",
    }),
    operationalTime: breakfastTime({
      operationPhase: "Preparation",
      minutesUntilService: 120,
    }),
  });
  assert.equal(result.state, "ready");
});

test("evs: ordinary open request does not automatically create Needs Attention", () => {
  const result = evaluateEvsReadiness({
    signals: baseSignals({
      unitId: "e1",
      unitName: "Wing A",
      unitType: UnitType.RESIDENT_AREA,
      profileKey: "EVS",
      openRepairCount: 1,
      normalPriorityOpenRepairCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "ready");
});

test("evs: active assigned cleaning work = In Progress", () => {
  const result = evaluateEvsReadiness({
    signals: baseSignals({
      unitId: "e1",
      unitName: "Wing A",
      unitType: UnitType.RESIDENT_AREA,
      profileKey: "EVS",
      openRepairCount: 1,
      assignedSignificantRepairCount: 1,
      highRepairCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "in_progress");
  assert.match(result.primaryReason, /in progress/i);
});

test("evs: overdue critical request or absent required coverage = Needs Attention", () => {
  const overdue = evaluateEvsReadiness({
    signals: baseSignals({
      unitId: "e1",
      unitName: "Wing A",
      unitType: UnitType.RESIDENT_AREA,
      profileKey: "EVS",
      overdueCriticalRepairCount: 1,
      highRepairCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(overdue.state, "blocked");

  const coverage = evaluateEvsReadiness({
    signals: baseSignals({
      unitId: "e1",
      unitName: "Wing A",
      unitType: UnitType.RESIDENT_AREA,
      profileKey: "EVS",
      requiresEvsCoverage: true,
      staffingCount: 0,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(coverage.state, "blocked");
  assert.match(coverage.primaryReason, /coverage is absent/i);
});

test("plant: routine open repair can remain Ready", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Boiler",
      unitType: UnitType.MECHANICAL,
      profileKey: "PLANT",
      openRepairCount: 2,
      normalPriorityOpenRepairCount: 2,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "ready");
});

test("plant: assigned significant repair = In Progress", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Boiler",
      unitType: UnitType.MECHANICAL,
      profileKey: "PLANT",
      highRepairCount: 1,
      openRepairCount: 1,
      assignedSignificantRepairCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "in_progress");
  assert.match(result.primaryReason, /being worked/i);
});

test("plant: uncontained urgent equipment failure = Needs Attention", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Boiler",
      unitType: UnitType.MECHANICAL,
      profileKey: "PLANT",
      urgentRepairCount: 1,
      primaryUrgentRepairTitle: "Dishwasher repair",
      unassignedUrgentOrHighCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "blocked");
  assert.match(result.primaryReason, /Dishwasher repair needs attention/i);
});

test("fallback: missing department profile uses conservative neutral behavior", () => {
  const result = evaluateNeutralReadiness({
    signals: baseSignals({
      unitId: "n1",
      unitName: "Other",
      unitType: UnitType.OTHER,
      profileKey: "NEUTRAL",
      pending: 3,
      openRepairCount: 2,
      normalPriorityOpenRepairCount: 2,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "ready");
});

test("fallback: operation engine off continues using heuristic operation context", () => {
  const now = new Date("2026-07-08T08:00:00");
  const batch = computeReadinessBatch({
    month: 7,
    managerCount: 0,
    birthdaysThisMonth: [],
    units: [
      {
        id: "kitchen",
        name: "Main Kitchen",
        unitType: UnitType.KITCHEN,
        mealTimes: [{ mealType: MealType.BREAKFAST, scheduledTime: "07:00" }],
        departmentResponsibilities: [{ department: { key: "DIETARY" } }],
      },
    ],
    assignments: [],
    submissionsToday: [],
    scheduleEntriesToday: [{ unitId: "kitchen", shift: "AM" }],
    overridesToday: [],
    openRepairs: [],
    serveryMealServiceEventsToday: [],
    now,
    facilityTimezone: "America/New_York",
  });

  assert.equal(batch.operationContext.mealType, MealType.BREAKFAST);
  assert.ok(batch.operationalTime.facilityTimezone);
  assert.equal(batch.byUnitId.get("kitchen")?.state, "ready");
});
