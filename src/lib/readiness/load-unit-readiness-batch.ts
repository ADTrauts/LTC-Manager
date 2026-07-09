import { getTodayWindow } from "@/lib/operations-center/get-today-window";
import { loadDashboardQueries } from "@/lib/operations-center/load-dashboard-queries";

import { computeReadinessBatch } from "./compute-readiness-batch";
import type { ReadinessBatchResult } from "./types";

export async function loadUnitReadinessBatch(facilityId: string): Promise<ReadinessBatchResult> {
  const window = getTodayWindow();
  const now = new Date();
  const queries = await loadDashboardQueries(facilityId, window);
  return computeReadinessBatch({ ...queries, now });
}
