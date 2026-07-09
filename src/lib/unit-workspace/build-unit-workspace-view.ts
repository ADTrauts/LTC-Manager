import { LogSubmissionStatus } from "@prisma/client";

import { ensureMenuSettingsDefaults, menuForDate } from "@/lib/menu-cycle";

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
}): UnitWorkspaceViewModel {
  const { unit, queries, search } = input;
  const now = input.now ?? new Date();
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
  };
}
