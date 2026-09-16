import type { AppJwtPayload } from "@/lib/auth";
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
  loadOperatingLocationBoard,
  loadedBoardToWalkList,
} from "./operating-locations";
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
    activeDepartmentId?: string | null;
    projectedUnitIds?: readonly string[];
    session?: AppJwtPayload | null;
  },
): Promise<WalkListData> {
  if (options?.session?.facilityId === facilityId) {
    try {
      let activeDepartmentId = options.activeDepartmentId ?? null;
      if (!activeDepartmentId && options.activeDepartmentKey) {
        const department = await prisma.department.findFirst({
          where: {
            facilityId,
            isActive: true,
            key: options.activeDepartmentKey,
          },
          select: { id: true },
        });
        activeDepartmentId = department?.id ?? null;
      }
      const loaded = await loadOperatingLocationBoard(facilityId, {
        session: options.session,
        activeDepartmentKey: options.activeDepartmentKey,
        activeDepartmentId,
      });
      return loadedBoardToWalkList(loaded);
    } catch (error) {
      console.warn("[todays-work] operating-location walk list skipped:", error);
    }
  }

  const now = new Date();
  const facilityTimezone = await loadFacilityTimezone(prisma, facilityId);
  const window = getFacilityLocalTodayWindow(facilityTimezone, now);
  const queries = await loadDashboardQueries(facilityId, window, {
    facilityTimezone,
    now,
    projectedUnitIds: options?.projectedUnitIds,
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
