import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { getFacilityLocalTodayWindow, loadFacilityTimezone } from "@/lib/operational-time";
import { loadDashboardQueries } from "@/lib/operations-center/load-dashboard-queries";
import { prisma } from "@/lib/prisma";

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
  const facilityTimezone =
    options?.facilityTimezone ?? (await loadFacilityTimezone(prisma, facilityId));
  const window = getFacilityLocalTodayWindow(facilityTimezone, now);
  const queries = await loadDashboardQueries(facilityId, window, {
    facilityTimezone,
    now,
  });
  return computeReadinessBatch({
    ...queries,
    now,
    activeDepartmentKey: options?.activeDepartmentKey,
    facilityTimezone,
  });
}
