import { LogSubmissionStatus, MealType, UnitType } from "@prisma/client";

import { isServerySlotLiveForBoard, isWithinServeryLiveWindow } from "@/lib/servery-meal-service";

import type { DashboardQueryResult } from "./load-dashboard-queries";
import type {
  OperationsCenterDashboardData,
  OperationsCenterMealBoard,
  OperationsCenterUnitCard,
} from "./types";

type BuildDashboardAggregatesInput = DashboardQueryResult & {
  now: Date;
};

export function buildDashboardAggregates(
  input: BuildDashboardAggregatesInput,
): OperationsCenterDashboardData {
  const {
    units,
    assignments,
    submissionsToday,
    scheduleEntriesToday,
    overridesToday,
    openRepairs,
    birthdaysThisMonth,
    serveryMealServiceEventsToday,
    managerCount,
    month,
    now,
  } = input;

  const serveryEventsByUnitMeal = new Map<
    string,
    { mealServiceReadyAt: Date | null; mealServiceStartedAt: Date | null }
  >();
  for (const ev of serveryMealServiceEventsToday) {
    serveryEventsByUnitMeal.set(`${ev.unitId}:${ev.mealType}`, {
      mealServiceReadyAt: ev.mealServiceReadyAt,
      mealServiceStartedAt: ev.mealServiceStartedAt,
    });
  }

  const assignmentsByUnit = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const list = assignmentsByUnit.get(assignment.unitId) ?? [];
    list.push(assignment);
    assignmentsByUnit.set(assignment.unitId, list);
  }

  const submissionsByUnit = new Map<string, typeof submissionsToday>();
  for (const submission of submissionsToday) {
    const list = submissionsByUnit.get(submission.unitId) ?? [];
    list.push(submission);
    submissionsByUnit.set(submission.unitId, list);
  }

  const unitCards: OperationsCenterUnitCard[] = units.map((unit) => {
    const unitAssignments = assignmentsByUnit.get(unit.id) ?? [];
    const unitSubmissions = submissionsByUnit.get(unit.id) ?? [];
    const expected = unitAssignments.reduce((sum, item) => sum + item.timesPerDay, 0);
    const completed = unitSubmissions.filter((item) => item.status === LogSubmissionStatus.COMPLETED).length;
    const failed = unitSubmissions.filter((item) => item.status === LogSubmissionStatus.FAILED).length;
    const missed = unitSubmissions.filter((item) => item.status === LogSubmissionStatus.MISSED).length;
    const pending = Math.max(expected - unitSubmissions.length, 0);

    let staffingCount = scheduleEntriesToday.filter((entry) => entry.unitId === unit.id).length;
    for (const override of overridesToday) {
      if (override.oldUnitId === unit.id) staffingCount -= 1;
      if (override.newUnitId === unit.id) staffingCount += 1;
    }

    const openRepairCount = openRepairs.filter((repair) => repair.unitId === unit.id).length;

    const hasDietary =
      unit.departmentResponsibilities.some((r) => r.department.key === "DIETARY") ||
      unit.unitType === UnitType.SERVERY ||
      unit.unitType === UnitType.KITCHEN ||
      unit.unitType === UnitType.RETAIL;

    return {
      id: unit.id,
      name: unit.name,
      unitType: unit.unitType,
      hasDietary,
      expected,
      completed,
      failed,
      missed,
      pending,
      mealTimes: unit.mealTimes,
      staffingCount: Math.max(staffingCount, 0),
      openRepairCount,
    };
  });

  const totals = unitCards.reduce(
    (acc, unit) => {
      acc.expected += unit.expected;
      acc.completed += unit.completed;
      acc.failed += unit.failed;
      acc.missed += unit.missed;
      acc.pending += unit.pending;
      return acc;
    },
    { expected: 0, completed: 0, failed: 0, missed: 0, pending: 0 },
  );

  const unitsWithExceptions = unitCards
    .filter(
      (unit) =>
        unit.failed > 0 ||
        unit.pending > 0 ||
        unit.missed > 0 ||
        unit.staffingCount === 0 ||
        unit.openRepairCount > 0,
    )
    .sort((a, b) => b.failed + b.pending + b.missed - (a.failed + a.pending + a.missed));

  const unitsMissingStaffing = unitCards.filter((unit) => unit.staffingCount === 0);
  const urgentRepairCount = openRepairs.filter((repair) => repair.priority === "URGENT").length;

  const mealBoards: OperationsCenterMealBoard[] = (Object.values(MealType) as MealType[]).map((meal) => {
    const dietaryUnits = unitCards.filter((u) => u.hasDietary);
    const rows = dietaryUnits
      .filter((unit) => {
        if (unit.unitType !== UnitType.SERVERY) return true;
        const ev = serveryEventsByUnitMeal.get(`${unit.id}:${meal}`);
        if (!ev) return false;
        return isServerySlotLiveForBoard({ ...ev, now });
      })
      .filter((unit) => unit.mealTimes.some((time) => time.mealType === meal))
      .map((unit) => {
        const mealTime = unit.mealTimes.find((time) => time.mealType === meal)?.scheduledTime ?? "--:--";
        const submittedForMeal = submissionsToday.filter(
          (submission) => submission.unitId === unit.id && submission.mealType === meal,
        ).length;
        let statusLabel: string;
        let isReadyLive = false;
        let isStartedLive = false;
        if (unit.unitType === UnitType.SERVERY) {
          const ev = serveryEventsByUnitMeal.get(`${unit.id}:${meal}`);
          const parts: string[] = [];
          isReadyLive = !!ev && isWithinServeryLiveWindow(ev.mealServiceReadyAt, now);
          isStartedLive = !!ev && isWithinServeryLiveWindow(ev.mealServiceStartedAt, now);
          if (isReadyLive) parts.push("Ready");
          if (isStartedLive) parts.push("Started");
          statusLabel = parts.length > 0 ? parts.join(" · ") : "—";
        } else {
          statusLabel = submittedForMeal > 0 ? "Logged" : "Not logged";
        }
        return {
          unitId: unit.id,
          unitName: unit.name,
          unitType: unit.unitType,
          mealTime,
          statusLabel,
          isReadyLive,
          isStartedLive,
        };
      });

    return { meal, rows };
  });

  return {
    month,
    managerCount,
    birthdaysThisMonth,
    unitCount: units.length,
    mealBoards,
    totals,
    unitsWithExceptions,
    unitsMissingStaffing,
    unitCards,
    openRepairCount: openRepairs.length,
    urgentRepairCount,
  };
}
