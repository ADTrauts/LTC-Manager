import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { loadCallDownList } from "@/lib/todays-work/load-call-down-list";
import { applyOperationScopedFacilityQueries } from "@/lib/operations/apply-operation-scoped-facility-queries";
import { resolveOperationsCenterActiveOperation } from "@/lib/operations/resolve-operations-center-active-operation";
import { getFacilityLocalTodayWindow, loadFacilityTimezone } from "@/lib/operational-time";
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

  return {
    ...dashboard,
    operationContext: activeOperation.operationContext,
    sitePulse,
    callDowns,
  };
}
