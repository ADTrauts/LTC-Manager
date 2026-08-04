import assert from "node:assert/strict";
import test from "node:test";

import { LogSubmissionStatus, MealType, ShiftType, UnitType } from "@prisma/client";

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
    evsRoomStatus: null,
    evsRoomStatusUpdatedAt: null,
    evsCriticalRoomCondition: false,
    evsDischargePending: false,
    evsActiveCleaning: false,
    evsRoomServiceComplete: false,
    evsRoomStatusPresent: false,
    outOfServiceAssetCount: 0,
    criticalOutOfServiceCount: 0,
    primaryCriticalOutOfServiceName: null,
    importantOutOfServiceCount: 0,
    primaryImportantOutOfServiceName: null,
    importantOutOfServiceAddressedCount: 0,
    importantOutOfServiceUnaddressedCount: 0,
    routineOutOfServiceCount: 0,
    overdueCriticalPmCount: 0,
    primaryOverdueCriticalPmName: null,
    overdueImportantPmCount: 0,
    overdueRoutinePmCount: 0,
    dueTodayPmScheduleCount: 0,
    pmDueTodayUnderwayElevatedCount: 0,
    significantActivelyWorkedCount: 0,
    urgentNotActivelyWorkedCount: 0,
    primarySignificantInProgressTitle: null,
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
    scheduleEntriesToday: [{ unitId: "servery", shift: ShiftType.FULL_DAY }],
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
    roomAreaStatusesToday: [],
    outOfServiceAssets: [],
    pmSchedulesDueThroughToday: [],
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

test("evs: completed current room service = Ready", () => {
  const result = evaluateEvsReadiness({
    signals: baseSignals({
      unitId: "e1",
      unitName: "Wing A",
      unitType: UnitType.RESIDENT_AREA,
      profileKey: "EVS",
      evsRoomStatus: "CLEAN",
      evsRoomStatusPresent: true,
      evsRoomServiceComplete: true,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "ready");
  assert.match(result.primaryReason, /cleaning round is complete/i);
});

test("evs: missing room signals fall back conservatively to Ready", () => {
  const result = evaluateEvsReadiness({
    signals: baseSignals({
      unitId: "e1",
      unitName: "Wing A",
      unitType: UnitType.RESIDENT_AREA,
      profileKey: "EVS",
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "ready");
  assert.match(result.primaryReason, /Ready for current EVS coverage/i);
});

test("evs: active dirty cleaning = In Progress", () => {
  const result = evaluateEvsReadiness({
    signals: baseSignals({
      unitId: "e1",
      unitName: "Wing A",
      unitType: UnitType.RESIDENT_AREA,
      profileKey: "EVS",
      evsRoomStatus: "DIRTY",
      evsRoomStatusPresent: true,
      evsActiveCleaning: true,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "in_progress");
  assert.match(result.primaryReason, /cleaning is in progress/i);
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

test("evs: staffed discharge cleaning = In Progress", () => {
  const result = evaluateEvsReadiness({
    signals: baseSignals({
      unitId: "e1",
      unitName: "Wing A",
      unitType: UnitType.RESIDENT_AREA,
      profileKey: "EVS",
      evsRoomStatus: "DISCHARGE",
      evsRoomStatusPresent: true,
      evsDischargePending: true,
      staffingCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "in_progress");
  assert.match(result.primaryReason, /Discharge cleaning is in progress/i);
});

test("evs: uncovered discharge cleaning = Needs Attention", () => {
  const result = evaluateEvsReadiness({
    signals: baseSignals({
      unitId: "e1",
      unitName: "Wing A",
      unitType: UnitType.RESIDENT_AREA,
      profileKey: "EVS",
      evsRoomStatus: "DISCHARGE",
      evsRoomStatusPresent: true,
      evsDischargePending: true,
      staffingCount: 0,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "blocked");
  assert.match(result.primaryReason, /Discharge cleaning needs attention/i);
});

test("evs: isolation cleaning needs attention", () => {
  const result = evaluateEvsReadiness({
    signals: baseSignals({
      unitId: "e1",
      unitName: "Wing A",
      unitType: UnitType.RESIDENT_AREA,
      profileKey: "EVS",
      evsRoomStatus: "ISOLATION",
      evsRoomStatusPresent: true,
      evsCriticalRoomCondition: true,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "blocked");
  assert.match(result.primaryReason, /Isolation cleaning needs attention/i);
});

test("evs: unassigned high-priority request = Needs Attention", () => {
  const result = evaluateEvsReadiness({
    signals: baseSignals({
      unitId: "e1",
      unitName: "Wing A",
      unitType: UnitType.RESIDENT_AREA,
      profileKey: "EVS",
      highRepairCount: 1,
      unassignedUrgentOrHighCount: 1,
      openRepairCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "blocked");
  assert.match(result.primaryReason, /Priority EVS request is unassigned/i);
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

test("evs: resolved critical room work returns to Ready", () => {
  const blocked = evaluateEvsReadiness({
    signals: baseSignals({
      unitId: "e1",
      unitName: "Wing A",
      unitType: UnitType.RESIDENT_AREA,
      profileKey: "EVS",
      evsRoomStatus: "ISOLATION",
      evsRoomStatusPresent: true,
      evsCriticalRoomCondition: true,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(blocked.state, "blocked");

  const ready = evaluateEvsReadiness({
    signals: baseSignals({
      unitId: "e1",
      unitName: "Wing A",
      unitType: UnitType.RESIDENT_AREA,
      profileKey: "EVS",
      evsRoomStatus: "CLEAN",
      evsRoomStatusPresent: true,
      evsRoomServiceComplete: true,
      evsCriticalRoomCondition: false,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(ready.state, "ready");
});

test("evs: facility-local service date drives room status in batch (future dates excluded)", () => {
  const now = new Date("2026-07-08T08:00:00");
  const batch = computeReadinessBatch({
    month: 7,
    managerCount: 0,
    birthdaysThisMonth: [],
    units: [
      {
        id: "wing-a",
        name: "Wing A",
        unitType: UnitType.RESIDENT_AREA,
        mealTimes: [],
        departmentResponsibilities: [{ department: { key: "EVS" } }],
      },
    ],
    assignments: [],
    submissionsToday: [],
    scheduleEntriesToday: [],
    overridesToday: [],
    openRepairs: [],
    serveryMealServiceEventsToday: [],
    // Only today's CLEAN row is provided — a future dirty status would not be loaded by the batch query.
    roomAreaStatusesToday: [
      {
        unitId: "wing-a",
        status: "CLEAN",
        notes: null,
        updatedAt: now,
        statusDate: new Date(Date.UTC(2026, 6, 8)),
      },
    ],
    outOfServiceAssets: [],
    pmSchedulesDueThroughToday: [],
    now,
    activeDepartmentKey: "EVS",
    facilityTimezone: "America/New_York",
  });

  assert.equal(batch.byUnitId.get("wing-a")?.state, "ready");
  assert.match(batch.byUnitId.get("wing-a")?.reason ?? "", /cleaning round is complete/i);
});

test("evs: dietary log failures do not affect EVS mode readiness", () => {
  const now = new Date("2026-07-08T08:00:00");
  const batch = computeReadinessBatch({
    month: 7,
    managerCount: 0,
    birthdaysThisMonth: [],
    units: [
      {
        id: "wing-a",
        name: "Wing A",
        unitType: UnitType.RESIDENT_AREA,
        mealTimes: [{ mealType: MealType.BREAKFAST, scheduledTime: "07:30" }],
        departmentResponsibilities: [{ department: { key: "EVS" } }],
      },
    ],
    assignments: [
      {
        id: "a1",
        unitId: "wing-a",
        templateId: "t1",
        mealType: MealType.BREAKFAST,
        timesPerDay: 1,
        template: { name: "Temp" },
      },
    ],
    submissionsToday: [
      {
        id: "s1",
        assignmentId: "a1",
        unitId: "wing-a",
        status: LogSubmissionStatus.FAILED,
        mealType: MealType.BREAKFAST,
      },
    ],
    scheduleEntriesToday: [],
    overridesToday: [],
    openRepairs: [],
    serveryMealServiceEventsToday: [],
    roomAreaStatusesToday: [
      {
        unitId: "wing-a",
        status: "CLEAN",
        notes: null,
        updatedAt: now,
        statusDate: new Date(Date.UTC(2026, 6, 8)),
      },
    ],
    outOfServiceAssets: [],
    pmSchedulesDueThroughToday: [],
    now,
    activeDepartmentKey: "EVS",
    facilityTimezone: "America/New_York",
  });

  assert.equal(batch.byUnitId.get("wing-a")?.state, "ready");
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
  assert.match(result.primaryReason, /No critical equipment issues/i);
});

test("plant: no critical asset issues = Ready", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Mechanical",
      unitType: UnitType.MECHANICAL,
      profileKey: "PLANT",
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "ready");
});

test("plant: missing Plant data remains conservative Ready", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Mechanical",
      unitType: UnitType.MECHANICAL,
      profileKey: "PLANT",
      outOfServiceAssetCount: 0,
      overdueCriticalPmCount: 0,
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
      primaryHighRepairTitle: "Dishwasher repair",
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "in_progress");
  assert.match(result.primaryReason, /Dishwasher repair is in progress|being worked/i);
});

test("plant: actively worked significant repair prefers IN_PROGRESS title", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Boiler",
      unitType: UnitType.MECHANICAL,
      profileKey: "PLANT",
      highRepairCount: 1,
      openRepairCount: 1,
      assignedSignificantRepairCount: 1,
      significantActivelyWorkedCount: 1,
      primarySignificantInProgressTitle: "Dishwasher repair",
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "in_progress");
  assert.match(result.primaryReason, /Dishwasher repair is in progress/i);
});

test("plant: unassigned URGENT repair = Needs Attention", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Boiler",
      unitType: UnitType.MECHANICAL,
      profileKey: "PLANT",
      urgentRepairCount: 1,
      primaryUrgentRepairTitle: "Walk-in cooler",
      unassignedUrgentOrHighCount: 1,
      urgentNotActivelyWorkedCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "blocked");
  assert.match(result.primaryReason, /Walk-in cooler needs attention/i);
});

test("plant: overdue HIGH repair = Needs Attention", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Boiler",
      unitType: UnitType.MECHANICAL,
      profileKey: "PLANT",
      highRepairCount: 1,
      overdueCriticalRepairCount: 1,
      assignedSignificantRepairCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "blocked");
  assert.match(result.primaryReason, /Priority repair is overdue/i);
});

test("plant: CRITICAL out-of-service asset = Needs Attention", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Kitchen",
      unitType: UnitType.KITCHEN,
      profileKey: "PLANT",
      outOfServiceAssetCount: 1,
      criticalOutOfServiceCount: 1,
      primaryCriticalOutOfServiceName: "Walk-in cooler",
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "blocked");
  assert.match(result.primaryReason, /Walk-in cooler needs attention/i);
});

test("plant: IMPORTANT out-of-service + assigned repair = In Progress", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Kitchen",
      unitType: UnitType.KITCHEN,
      profileKey: "PLANT",
      outOfServiceAssetCount: 1,
      importantOutOfServiceCount: 1,
      primaryImportantOutOfServiceName: "Hot well",
      importantOutOfServiceAddressedCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "in_progress");
  assert.match(result.primaryReason, /Hot well is being addressed/i);
});

test("plant: IMPORTANT out-of-service + unassigned overdue repair = Needs Attention", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Kitchen",
      unitType: UnitType.KITCHEN,
      profileKey: "PLANT",
      outOfServiceAssetCount: 1,
      importantOutOfServiceCount: 1,
      primaryImportantOutOfServiceName: "Hot well",
      importantOutOfServiceUnaddressedCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "blocked");
  assert.match(result.primaryReason, /Hot well needs attention/i);
});

test("plant: ROUTINE out-of-service asset alone remains Ready", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Office",
      unitType: UnitType.OTHER,
      profileKey: "PLANT",
      outOfServiceAssetCount: 1,
      routineOutOfServiceCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "ready");
});

test("plant: ROUTINE asset with URGENT repair can still become Needs Attention", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Office",
      unitType: UnitType.OTHER,
      profileKey: "PLANT",
      outOfServiceAssetCount: 1,
      routineOutOfServiceCount: 1,
      urgentRepairCount: 1,
      urgentNotActivelyWorkedCount: 1,
      primaryUrgentRepairTitle: "Printer short",
      unassignedUrgentOrHighCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "blocked");
  assert.match(result.primaryReason, /Printer short needs attention/i);
});

test("plant: overdue PM on CRITICAL asset = Needs Attention", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Mechanical",
      unitType: UnitType.MECHANICAL,
      profileKey: "PLANT",
      overdueCriticalPmCount: 1,
      primaryOverdueCriticalPmName: "Boiler inspection",
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "blocked");
  assert.match(result.primaryReason, /preventive maintenance is overdue/i);
});

test("plant: due PM underway on IMPORTANT asset = In Progress", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Mechanical",
      unitType: UnitType.MECHANICAL,
      profileKey: "PLANT",
      dueTodayPmScheduleCount: 1,
      pmDueTodayUnderwayElevatedCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "in_progress");
  assert.match(result.primaryReason, /Preventive maintenance is underway/i);
});

test("plant: routine overdue PM alone does not force Needs Attention", () => {
  const result = evaluatePlantReadiness({
    signals: baseSignals({
      unitId: "p1",
      unitName: "Mechanical",
      unitType: UnitType.MECHANICAL,
      profileKey: "PLANT",
      overdueRoutinePmCount: 1,
    }),
    operationalTime: breakfastTime(),
  });
  assert.equal(result.state, "ready");
});

test("plant: future PM excluded from batch does not affect readiness", () => {
  const now = new Date("2026-07-08T12:00:00");
  const batch = computeReadinessBatch({
    month: 7,
    managerCount: 0,
    birthdaysThisMonth: [],
    units: [
      {
        id: "mech",
        name: "Mechanical",
        unitType: UnitType.MECHANICAL,
        mealTimes: [],
        departmentResponsibilities: [{ department: { key: "PLANT" } }],
      },
    ],
    assignments: [],
    submissionsToday: [],
    scheduleEntriesToday: [],
    overridesToday: [],
    openRepairs: [],
    serveryMealServiceEventsToday: [],
    roomAreaStatusesToday: [],
    outOfServiceAssets: [],
    // Future PM would not be loaded (nextDueAt >= window.end); empty list simulates exclusion.
    pmSchedulesDueThroughToday: [],
    now,
    activeDepartmentKey: "PLANT",
    facilityTimezone: "America/New_York",
  });
  assert.equal(batch.byUnitId.get("mech")?.state, "ready");
});

test("plant: closed repairs are excluded from openRepairs batch input", () => {
  const now = new Date("2026-07-08T12:00:00");
  const batch = computeReadinessBatch({
    month: 7,
    managerCount: 0,
    birthdaysThisMonth: [],
    units: [
      {
        id: "mech",
        name: "Mechanical",
        unitType: UnitType.MECHANICAL,
        mealTimes: [],
        departmentResponsibilities: [{ department: { key: "PLANT" } }],
      },
    ],
    assignments: [],
    submissionsToday: [],
    scheduleEntriesToday: [],
    overridesToday: [],
    // CLOSED repairs are filtered at query time; batch only receives open work.
    openRepairs: [],
    serveryMealServiceEventsToday: [],
    roomAreaStatusesToday: [],
    outOfServiceAssets: [],
    pmSchedulesDueThroughToday: [],
    now,
    activeDepartmentKey: "PLANT",
    facilityTimezone: "America/New_York",
  });
  assert.equal(batch.byUnitId.get("mech")?.state, "ready");
});

test("plant: facility-local overdue dueAt comparison", () => {
  const now = new Date("2026-07-08T16:00:00Z");
  const batch = computeReadinessBatch({
    month: 7,
    managerCount: 0,
    birthdaysThisMonth: [],
    units: [
      {
        id: "mech",
        name: "Mechanical",
        unitType: UnitType.MECHANICAL,
        mealTimes: [],
        departmentResponsibilities: [{ department: { key: "PLANT" } }],
      },
    ],
    assignments: [],
    submissionsToday: [],
    scheduleEntriesToday: [],
    overridesToday: [],
    openRepairs: [
      {
        id: "r1",
        unitId: "mech",
        assetId: null,
        title: "Generator check",
        priority: "HIGH",
        status: "OPEN",
        workOrderKind: "CORRECTIVE",
        assignedEmployeeId: "e1",
        dueAt: new Date("2026-07-08T12:00:00Z"),
        preventiveScheduleId: null,
        responsibleDepartment: { key: "PLANT" },
        asset: null,
      },
    ],
    serveryMealServiceEventsToday: [],
    roomAreaStatusesToday: [],
    outOfServiceAssets: [],
    pmSchedulesDueThroughToday: [],
    now,
    activeDepartmentKey: "PLANT",
    facilityTimezone: "America/New_York",
  });
  assert.equal(batch.byUnitId.get("mech")?.state, "blocked");
  assert.match(batch.byUnitId.get("mech")?.reason ?? "", /overdue/i);
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
      urgentNotActivelyWorkedCount: 1,
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
    scheduleEntriesToday: [{ unitId: "kitchen", shift: ShiftType.FULL_DAY }],
    overridesToday: [],
    openRepairs: [],
    serveryMealServiceEventsToday: [],
    roomAreaStatusesToday: [],
    outOfServiceAssets: [],
    pmSchedulesDueThroughToday: [],
    now,
    facilityTimezone: "America/New_York",
  });

  assert.equal(batch.operationContext.mealType, MealType.BREAKFAST);
  assert.ok(batch.operationalTime.facilityTimezone);
  assert.equal(batch.byUnitId.get("kitchen")?.state, "ready");
});
