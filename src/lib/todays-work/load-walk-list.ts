import { computeReadinessBatch } from "@/lib/readiness";
import {
  getTodayWindow,
  loadDashboardQueries,
  type OperationContext,
} from "@/lib/operations-center";

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
  const batch = computeReadinessBatch({ ...queries, now });
  const items = buildWalkListItems(batch.unitCards, batch.byUnitId);

  return {
    items,
    summary: summarizeWalkList(items),
    operationContext: batch.operationContext,
    lookFirst: items.find((item) => item.status !== "ready") ?? items[0] ?? null,
  };
}

export type { WalkListData, WalkListItem, WalkListSummary, OperationContext };
