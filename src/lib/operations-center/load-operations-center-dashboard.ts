import { loadCallDownList } from "@/lib/todays-work/load-call-down-list";
import { resolveOperationsCenterActiveOperation } from "@/lib/operations/resolve-operations-center-active-operation";
import { scopeLogDueQueries } from "@/lib/operations/scope-log-due-queries";
import { buildSitePulseFromReadinessSummary, computeReadinessBatch } from "@/lib/readiness";
import { prisma } from "@/lib/prisma";
import { getTodayWindow } from "./get-today-window";
import { buildDashboardAggregates } from "./build-dashboard-aggregates";
import { loadDashboardQueries } from "./load-dashboard-queries";
import type { OperationsCenterDashboardData } from "./types";

export async function loadOperationsCenterDashboard(
  facilityId: string,
): Promise<OperationsCenterDashboardData> {
  const window = getTodayWindow();
  const now = new Date();
  const queries = await loadDashboardQueries(facilityId, window);
  const preliminary = buildDashboardAggregates({ ...queries, now });
  const [callDowns, activeOperation] = await Promise.all([
    loadCallDownList(facilityId),
    resolveOperationsCenterActiveOperation(prisma, {
      facilityId,
      now,
      unitCards: preliminary.unitCards,
      mealBoards: preliminary.mealBoards,
    }),
  ]);

  const scopedLogs = scopeLogDueQueries({
    assignments: queries.assignments,
    submissions: queries.submissionsToday,
    activeOperation,
  });
  const scopedQueries = {
    ...queries,
    assignments: scopedLogs.assignments,
    submissionsToday: scopedLogs.submissions,
  };

  const dashboard = buildDashboardAggregates({ ...scopedQueries, now });
  const readiness = computeReadinessBatch({ ...scopedQueries, now });

  return {
    ...dashboard,
    operationContext: activeOperation.operationContext,
    sitePulse: buildSitePulseFromReadinessSummary(readiness.summary),
    callDowns,
  };
}
