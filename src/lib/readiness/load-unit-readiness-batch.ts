import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { getFacilityLocalTodayWindow } from "@/lib/operational-time";
import { loadDashboardQueries } from "@/lib/operations-center/load-dashboard-queries";

import { computeReadinessBatch } from "./compute-readiness-batch";
import type { ReadinessBatchResult } from "./types";

export async function loadUnitReadinessBatch(
  facilityId: string,
  options?: {
    activeDepartmentKey?: OperationalDepartmentKey | null;
    facilityTimezone?: string | null;
    now?: Date;
  },
): Promise<ReadinessBatchResult> {
  const now = options?.now ?? new Date();
  const window = getFacilityLocalTodayWindow(options?.facilityTimezone, now);
  const queries = await loadDashboardQueries(facilityId, window);
  return computeReadinessBatch({
    ...queries,
    now,
    activeDepartmentKey: options?.activeDepartmentKey,
    facilityTimezone: options?.facilityTimezone,
  });
}
