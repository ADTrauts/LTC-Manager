import { loadCallDownList } from "@/lib/todays-work/load-call-down-list";
import { applyOperationScopedFacilityQueries } from "@/lib/operations/apply-operation-scoped-facility-queries";
import { resolveOperationsCenterActiveOperation } from "@/lib/operations/resolve-operations-center-active-operation";
import { getFacilityLocalTodayWindow, loadFacilityTimezone } from "@/lib/operational-time";
import { buildSitePulseFromReadinessSummary, computeReadinessBatch } from "@/lib/readiness";
import { prisma } from "@/lib/prisma";
import { buildDashboardAggregates } from "./build-dashboard-aggregates";
import { loadDashboardQueries } from "./load-dashboard-queries";
import type { OperationsCenterDashboardData } from "./types";

export async function loadOperationsCenterDashboard(
  facilityId: string,
): Promise<OperationsCenterDashboardData> {
  const now = new Date();
  const facilityTimezone = await loadFacilityTimezone(prisma, facilityId);
  const window = getFacilityLocalTodayWindow(facilityTimezone, now);
  const queries = await loadDashboardQueries(facilityId, window);
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
  const readiness = computeReadinessBatch({
    ...scopedQueries,
    now,
    activeDepartmentKey: "DIETARY",
    facilityTimezone,
    operationContextOverride: activeOperation.operationContext,
  });

  return {
    ...dashboard,
    operationContext: activeOperation.operationContext,
    sitePulse: buildSitePulseFromReadinessSummary(readiness.summary),
    callDowns,
  };
}
