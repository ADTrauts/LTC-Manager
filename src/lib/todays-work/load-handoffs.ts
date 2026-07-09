import {
  buildDashboardAggregates,
  getTodayWindow,
  loadDashboardQueries,
  type OperationContext,
} from "@/lib/operations-center";
import { prisma } from "@/lib/prisma";

import { buildHandoffData, type HandoffData, type HandoffSection, type HandoffSummary } from "./handoffs";
import { loadCallDownList } from "./load-call-down-list";
import { loadCoverageList } from "./load-coverage-list";
import { loadWalkList } from "./load-walk-list";

export async function loadHandoffs(facilityId: string): Promise<HandoffData> {
  const window = getTodayWindow();
  const now = new Date();

  const [walkList, coverage, callDowns, queries, repairs] = await Promise.all([
    loadWalkList(facilityId),
    loadCoverageList(facilityId),
    loadCallDownList(facilityId),
    loadDashboardQueries(facilityId, window),
    prisma.repair.findMany({
      where: { status: { not: "CLOSED" }, unit: { facilityId } },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        priority: true,
        unitId: true,
        unit: { select: { name: true } },
      },
    }),
  ]);

  const dashboard = buildDashboardAggregates({ ...queries, now });

  return buildHandoffData({
    walkListItems: walkList.items,
    coverageItems: coverage.items,
    callDownItems: callDowns.items,
    repairs: repairs.map((repair) => ({
      id: repair.id,
      title: repair.title,
      priority: repair.priority,
      unitId: repair.unitId,
      unitName: repair.unit.name,
    })),
    mealBoards: dashboard.mealBoards,
    operationContext: walkList.operationContext,
  });
}

export type { HandoffData, HandoffSection, HandoffSummary, OperationContext };
