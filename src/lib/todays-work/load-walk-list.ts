import { computeReadinessBatch } from "@/lib/readiness";
import {
  buildDashboardAggregates,
  getTodayWindow,
  loadDashboardQueries,
  type OperationContext,
} from "@/lib/operations-center";
import { applyOperationScopedFacilityQueries } from "@/lib/operations/apply-operation-scoped-facility-queries";
import { resolveOperationsCenterActiveOperation } from "@/lib/operations/resolve-operations-center-active-operation";
import { prisma } from "@/lib/prisma";

import {
  buildWalkListItems,
  summarizeWalkList,
  type WalkListData,
  type WalkListItem,
  type WalkListSummary,
} from "./walk-list";

export async function loadWalkList(facilityId: string): Promise<WalkListData> {
  const window = getTodayWindow();
  const now = new Date();
  const queries = await loadDashboardQueries(facilityId, window);
  const preliminary = buildDashboardAggregates({ ...queries, now });
  const activeOperation = await resolveOperationsCenterActiveOperation(prisma, {
    facilityId,
    now,
    unitCards: preliminary.unitCards,
    mealBoards: preliminary.mealBoards,
  });
  const scopedQueries = applyOperationScopedFacilityQueries(queries, activeOperation);
  const batch = computeReadinessBatch({ ...scopedQueries, now });
  const items = buildWalkListItems(batch.unitCards, batch.byUnitId);

  return {
    items,
    summary: summarizeWalkList(items),
    operationContext: activeOperation.operationContext,
    lookFirst: items.find((item) => item.status !== "ready") ?? items[0] ?? null,
  };
}

export type { WalkListData, WalkListItem, WalkListSummary, OperationContext };
