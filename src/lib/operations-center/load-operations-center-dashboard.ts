import { loadCallDownList } from "@/lib/todays-work/load-call-down-list";
import { getTodayWindow } from "./get-today-window";
import { buildDashboardAggregates } from "./build-dashboard-aggregates";
import { loadDashboardQueries } from "./load-dashboard-queries";
import type { OperationsCenterDashboardData } from "./types";

export async function loadOperationsCenterDashboard(
  facilityId: string,
): Promise<OperationsCenterDashboardData> {
  const window = getTodayWindow();
  const now = new Date();
  const [queries, callDowns] = await Promise.all([
    loadDashboardQueries(facilityId, window),
    loadCallDownList(facilityId),
  ]);
  const dashboard = buildDashboardAggregates({ ...queries, now });
  return { ...dashboard, callDowns };
}
