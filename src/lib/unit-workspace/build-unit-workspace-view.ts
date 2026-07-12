import { LogSubmissionStatus } from "@prisma/client";

import { ensureMenuSettingsDefaults, menuForDate } from "@/lib/menu-cycle";
import { filterInspectionsForUnit } from "@/lib/work/inspections/list-unit-inspections";
import { inspectionResultOperatorCopy } from "@/lib/work/inspections/result-copy";
import type { InspectionResult } from "@prisma/client";

import { buildUnitWorkQueue } from "./build-unit-work-queue";
import { computeUnitWorkspaceReadiness } from "./compute-unit-workspace-readiness";
import { normalizeLogTab } from "./normalize-log-tab";
import { resolveUnitOperationContext } from "./resolve-unit-operation-context";
import type { UnitQueryResult } from "./load-unit-queries";
import type {
  UnitWorkspaceSearchParams,
  UnitWorkspaceUnit,
  UnitWorkspaceViewModel,
} from "./types";

export function buildUnitWorkspaceView(input: {
  unit: UnitWorkspaceUnit;
  queries: UnitQueryResult;
  search: UnitWorkspaceSearchParams;
  now?: Date;
  facilityTimezone?: string | null;
  facilityId: string;
  activeDepartmentKey?: "DIETARY" | "EVS" | "PLANT" | null;
}): UnitWorkspaceViewModel {
  const { unit, queries, search, facilityId } = input;
  const now = input.now ?? new Date();
  const facilityTimezone = input.facilityTimezone;
  const {
    assignments,
    submissions,
    schedulesToday,
    overridesToday,
    mealServiceEventsToday,
    logHistory,
    menuData,
  } = queries;

  const activeUnitTab = search.unitTab === "logs" ? "logs" : "overview";

  const mealServiceEventByMeal = new Map(
    mealServiceEventsToday.map((row) => [row.mealType, row] as const),
  );

  const expected = assignments.reduce((sum, assignment) => sum + assignment.timesPerDay, 0);
  const completed = submissions.filter((item) => item.status === LogSubmissionStatus.COMPLETED).length;
  const failed = submissions.filter((item) => item.status === LogSubmissionStatus.FAILED).length;
  const missed = submissions.filter((item) => item.status === LogSubmissionStatus.MISSED).length;
  const pending = Math.max(expected - submissions.length, 0);
  const movedOut = overridesToday.filter((item) => item.oldUnitId === unit.id).length;
  const movedIn = overridesToday.filter((item) => item.newUnitId === unit.id).length;
  const effectiveCoverage = Math.max(schedulesToday.length - movedOut + movedIn, 0);

  const mealServiceEventMessage =
    search.mealServiceEvent === "ready-recorded"
      ? "Meal service ready time saved."
      : search.mealServiceEvent === "started-recorded"
        ? "Meal service started time saved."
        : null;

  const availableInspections = filterInspectionsForUnit({
    definitions: queries.inspectionDefinitions,
    facilityId,
    unitId: unit.id,
  });

  const openInspectionFollowUps = queries.openInspectionFollowUps.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status as "OPEN" | "IN_PROGRESS",
    description: task.description,
  }));

  const followUpBySourceItemId = new Map(
    queries.inspectionFindingTasks.map((task) => [task.sourceId, task] as const),
  );

  const inspectionHistory = queries.inspectionHistory.map((row) => ({
    id: row.id,
    definitionName: row.definition.name,
    submittedAt: row.submittedAt,
    result: row.result,
    submittedByName: row.submittedByEmployee
      ? `${row.submittedByEmployee.firstName} ${row.submittedByEmployee.lastName}`
      : null,
    findings: row.items
      .filter((item) => item.passed === false && item.definitionItem.failureCreatesFollowUp)
      .map((item) => {
        const task = followUpBySourceItemId.get(item.id);
        return {
          submissionItemId: item.id,
          itemLabel: item.definitionItem.label,
          followUpStatus: (task?.status as
            | "OPEN"
            | "IN_PROGRESS"
            | "COMPLETED"
            | "CANCELLED"
            | null) ?? null,
          followUpTaskId: task?.id ?? null,
        };
      }),
  }));

  const activeInspectId =
    typeof search.inspect === "string" &&
    (availableInspections.some((definition) => definition.id === search.inspect) ||
      queries.scheduledInspections.some((row) => row.definitionId === search.inspect))
      ? search.inspect
      : null;

  const activeOccurrenceId =
    typeof search.occurrence === "string" &&
    queries.scheduledInspections.some((row) => row.id === search.occurrence)
      ? search.occurrence
      : null;

  const activeFollowUpTaskId =
    typeof search.followUpTask === "string" &&
    openInspectionFollowUps.some((task) => task.id === search.followUpTask)
      ? search.followUpTask
      : null;

  const inspectionResultMessage =
    search.inspectionResult === "PASSED" ||
    search.inspectionResult === "PASSED_WITH_FINDINGS" ||
    search.inspectionResult === "FAILED"
      ? inspectionResultOperatorCopy(search.inspectionResult as InspectionResult)
      : null;

  const logCategories = Array.from(new Set(assignments.map((assignment) => assignment.template.category))).sort(
    (a, b) => a.localeCompare(b),
  );
  const baseLogTabs = logCategories.map((category) => ({ key: normalizeLogTab(category), label: category }));
  const logTabs =
    unit.unitType === "SERVERY" ? [{ key: "service-log", label: "Service Log" }, ...baseLogTabs] : baseLogTabs;
  const activeLogTab =
    logTabs.find((tab) => tab.key === (search.logTab ?? ""))?.key ?? (logTabs.length > 0 ? logTabs[0].key : null);
  const selectedLogCategory =
    logTabs.find((tab) => tab.key === activeLogTab && tab.key !== "service-log")?.label ?? null;
  const selectedLogHistory =
    selectedLogCategory === null
      ? []
      : logHistory.filter((entry) => entry.template.category === selectedLogCategory);

  const menuSettings = ensureMenuSettingsDefaults(menuData.settingsRaw);
  const menuUnavailableReason = menuData.unavailableReason;
  const todaysMenu = menuForDate({
    date: now,
    settings: menuSettings,
    periods: menuSettings.periods,
    menuItems: menuData.menuItems,
  });

  const operationContext = resolveUnitOperationContext({
    unit,
    mealServiceEventByMeal,
    now,
    facilityTimezone,
  });

  const workQueue = buildUnitWorkQueue({
    unit,
    queries: {
      assignments,
      submissions,
      openRepairs: queries.openRepairs,
    },
    mealServiceEventByMeal,
    activeLogTab,
    availableInspections,
    openInspectionFollowUps,
    scheduledInspections: queries.scheduledInspections,
    now,
  });

  const readiness = computeUnitWorkspaceReadiness({
    unit,
    queries,
    mealServiceEventByMeal,
    operationContext,
    failed,
    missed,
    pending,
    expected,
    completed,
    effectiveCoverage,
    now,
    facilityTimezone,
    activeDepartmentKey: input.activeDepartmentKey,
  });

  return {
    unit,
    queries,
    activeUnitTab,
    activeLogTab,
    logTabs,
    selectedLogCategory,
    selectedLogHistory,
    expected,
    completed,
    failed,
    missed,
    pending,
    movedOut,
    movedIn,
    effectiveCoverage,
    mealServiceEventMessage,
    mealServiceEventByMeal,
    menuSettings,
    menuUnavailableReason,
    todaysMenu,
    now,
    operationContext,
    workQueue,
    readiness,
    availableInspections,
    inspectionHistory,
    openInspectionFollowUps,
    activeInspectId,
    activeOccurrenceId,
    activeFollowUpTaskId,
    inspectionResultMessage,
    facilityTimezone: facilityTimezone ?? null,
  };
}
