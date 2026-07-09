import { loadCallDownList } from "@/lib/todays-work/load-call-down-list";
import { buildSitePulseFromReadinessSummary, computeReadinessBatch } from "@/lib/readiness";
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
  const readiness = computeReadinessBatch({ ...queries, now });
  const [dashboard, callDowns] = await Promise.all([
    Promise.resolve(buildDashboardAggregates({ ...queries, now })),
    loadCallDownList(facilityId),
  ]);

  return {
    ...dashboard,
    sitePulse: buildSitePulseFromReadinessSummary(readiness.summary),
    callDowns,
  };
}
