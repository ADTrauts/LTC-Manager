import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { computeReadinessBatch } from "@/lib/readiness";
import {
  buildDashboardAggregates,
  loadDashboardQueries,
  type OperationContext,
} from "@/lib/operations-center";
import { applyOperationScopedFacilityQueries } from "@/lib/operations/apply-operation-scoped-facility-queries";
import { resolveOperationsCenterActiveOperation } from "@/lib/operations/resolve-operations-center-active-operation";
import { getFacilityLocalTodayWindow, loadFacilityTimezone } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import {
  buildWalkListItems,
  summarizeWalkList,
  type WalkListData,
  type WalkListItem,
  type WalkListSummary,
} from "./walk-list";

export async function loadWalkList(
  facilityId: string,
  options?: {
    activeDepartmentKey?: OperationalDepartmentKey | null;
  },
): Promise<WalkListData> {
  const now = new Date();
  const facilityTimezone = await loadFacilityTimezone(prisma, facilityId);
  const window = getFacilityLocalTodayWindow(facilityTimezone, now);
  const queries = await loadDashboardQueries(facilityId, window, {
    facilityTimezone,
    now,
  });
  const preliminary = buildDashboardAggregates({ ...queries, now, facilityTimezone });
  const activeOperation = await resolveOperationsCenterActiveOperation(prisma, {
    facilityId,
    now,
    unitCards: preliminary.unitCards,
    mealBoards: preliminary.mealBoards,
    facilityTimezone,
  });
  const scopedQueries = applyOperationScopedFacilityQueries(queries, activeOperation);
  const batch = computeReadinessBatch({
    ...scopedQueries,
    now,
    activeDepartmentKey: options?.activeDepartmentKey ?? "DIETARY",
    facilityTimezone,
    operationContextOverride: activeOperation.operationContext,
  });
  const items = buildWalkListItems(batch.unitCards, batch.byUnitId);

  return {
    items,
    summary: summarizeWalkList(items),
    operationContext: activeOperation.operationContext,
    lookFirst: items.find((item) => item.status !== "ready") ?? items[0] ?? null,
  };
}

export type { WalkListData, WalkListItem, WalkListSummary, OperationContext };
