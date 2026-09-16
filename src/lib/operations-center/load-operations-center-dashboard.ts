import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { loadCallDownList } from "@/lib/todays-work/load-call-down-list";
import { applyOperationScopedFacilityQueries } from "@/lib/operations/apply-operation-scoped-facility-queries";
import { resolveOperationsCenterActiveOperation } from "@/lib/operations/resolve-operations-center-active-operation";
import { getFacilityLocalTodayWindow, getFacilityServiceDate, loadFacilityTimezone, toServiceDateKey } from "@/lib/operational-time";
import {
  buildSitePulseFromReadinessSummary,
  computeReadinessBatch,
} from "@/lib/readiness";
import { prisma } from "@/lib/prisma";
import { buildDashboardAggregates } from "./build-dashboard-aggregates";
import { computeSitePulse } from "./compute-site-pulse";
import { loadDashboardQueries } from "./load-dashboard-queries";
import type { OperationsCenterDashboardData } from "./types";

export type LoadOperationsCenterDashboardOptions = {
  activeDepartmentKey?: OperationalDepartmentKey | null;
  /**
   * Wave 15J — when set, constrain dashboard queries to projected Units early.
   * Empty array is valid (empty Projection). Omit for legacy facility-wide load.
   */
  projectedUnitIds?: readonly string[];
  /**
   * When true, readiness failures degrade Site Pulse without broadening Units.
   */
  degradeReadinessOnFailure?: boolean;
};

export async function loadOperationsCenterDashboard(
  facilityId: string,
  options?: LoadOperationsCenterDashboardOptions,
): Promise<OperationsCenterDashboardData> {
  const now = new Date();
  const facilityTimezone = await loadFacilityTimezone(prisma, facilityId);
  const window = getFacilityLocalTodayWindow(facilityTimezone, now);
  const queries = await loadDashboardQueries(facilityId, window, {
    facilityTimezone,
    now,
    projectedUnitIds: options?.projectedUnitIds,
  });
  const preliminary = buildDashboardAggregates({ ...queries, now, facilityTimezone });
  const [callDowns, activeOperation] = await Promise.all([
    loadCallDownList(facilityId),
    resolveOperationsCenterActiveOperation(prisma, {
      facilityId,
      now,
      unitCards: preliminary.unitCards,
      mealBoards: preliminary.mealBoards,
      facilityTimezone,
    }),
  ]);

  const scopedQueries = applyOperationScopedFacilityQueries(queries, activeOperation);

  const dashboard = buildDashboardAggregates({ ...scopedQueries, now, facilityTimezone });

  let sitePulse = dashboard.sitePulse;
  if (options?.degradeReadinessOnFailure) {
    try {
      const readiness = computeReadinessBatch({
        ...scopedQueries,
        now,
        activeDepartmentKey: options?.activeDepartmentKey ?? null,
        facilityTimezone,
        operationContextOverride: activeOperation.operationContext,
      });
      sitePulse = buildSitePulseFromReadinessSummary(readiness.summary);
    } catch {
      sitePulse = {
        ...computeSitePulse(dashboard.unitCards),
        tone: "neutral",
        headline: "Readiness temporarily unavailable",
      };
    }
  } else {
    const readiness = computeReadinessBatch({
      ...scopedQueries,
      now,
      activeDepartmentKey: options?.activeDepartmentKey ?? "DIETARY",
      facilityTimezone,
      operationContextOverride: activeOperation.operationContext,
    });
    sitePulse = buildSitePulseFromReadinessSummary(readiness.summary);
  }

  let keyTimeSummaries: OperationsCenterDashboardData["keyTimeSummaries"] = [];
  let runPresentation: OperationsCenterDashboardData["runPresentation"] = null;
  try {
    const departments = await prisma.department.findMany({
      where: { facilityId, isActive: true },
      select: { id: true, key: true },
    });
    const { materializeKeyTimeDayExpectations } = await import(
      "@/lib/operational-cycles/materialize-key-time-day-expectations"
    );
    const { loadPublishedCyclesWithKeyTimesForDate } = await import(
      "@/lib/operational-cycles/load-published-cycles"
    );
    const { localHhMmFromInstant } = await import(
      "@/lib/operational-cycles/key-time-day-expectation"
    );
    const { presentDepartmentRunOperation } = await import(
      "@/lib/operational-cycles/present-run-operation"
    );
    const nowLocal = localHhMmFromInstant(now, facilityTimezone ?? "UTC");
    const operationalDateKey = toServiceDateKey(
      getFacilityServiceDate(facilityTimezone ?? "UTC", now),
    );
    for (const department of departments) {
      const [cycles, materialized] = await Promise.all([
        loadPublishedCyclesWithKeyTimesForDate(
          facilityId,
          department.id,
          operationalDateKey,
        ),
        materializeKeyTimeDayExpectations({
          facilityId,
          departmentId: department.id,
          now,
        }),
      ]);
      const matchesActive =
        !options?.activeDepartmentKey || department.key === options.activeDepartmentKey;
      if (matchesActive && !runPresentation) {
        const presented = presentDepartmentRunOperation({
          cycles,
          timings: materialized.timings,
          now,
          facilityTimezone: facilityTimezone ?? "UTC",
          operationalDateKey,
          nowLocalHhMm: nowLocal,
        });
        if (presented.provenance === "NEW_PERIOD_KEY_TIME") {
          runPresentation = presented;
        }
      }
    }
    if (runPresentation) {
      keyTimeSummaries = runPresentation.keyTimeSummaries.map((group) => ({
        cycleLabel: group.label,
        parentCycleLabel: null,
        displayPath: group.label,
        expectedToday: group.dueLabel,
        total: group.total,
        completed: group.completed,
        overdue: group.overdue,
      }));
    }
  } catch (error) {
    console.warn("[dashboard] key time summaries skipped:", error);
    keyTimeSummaries = [];
    runPresentation = null;
  }

  return {
    ...dashboard,
    operationContext: activeOperation.operationContext,
    sitePulse,
    callDowns,
    keyTimeSummaries,
    runPresentation,
  };
}
