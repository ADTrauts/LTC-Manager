import { getTodayWindow } from "@/lib/operations-center";
import { resolveUnitWorkspaceActiveOperation } from "@/lib/operations/resolve-unit-workspace-active-operation";
import { scopeLogDueQueries } from "@/lib/operations/scope-log-due-queries";
import { prisma } from "@/lib/prisma";

import { buildUnitWorkspaceView } from "./build-unit-workspace-view";
import { loadUnitQueries } from "./load-unit-queries";
import { loadUnitRecord } from "./load-unit-record";
import type { UnitWorkspaceSearchParams, UnitWorkspaceViewModel } from "./types";

export async function loadUnitWorkspace(
  facilityId: string,
  unitId: string,
  search: UnitWorkspaceSearchParams = {},
): Promise<UnitWorkspaceViewModel | null> {
  const unit = await loadUnitRecord(facilityId, unitId);
  if (!unit) {
    return null;
  }

  const window = getTodayWindow();
  const queries = await loadUnitQueries({
    unitId: unit.id,
    facilityId,
    unitType: unit.unitType,
    window,
  });

  const now = new Date();
  const preliminaryView = buildUnitWorkspaceView({ unit, queries, search, now });
  const activeOperation = await resolveUnitWorkspaceActiveOperation(prisma, {
    facilityId,
    unit: preliminaryView.unit,
    mealServiceEventByMeal: preliminaryView.mealServiceEventByMeal,
    now: preliminaryView.now,
  });

  const scopedLogs = scopeLogDueQueries({
    assignments: queries.assignments,
    submissions: queries.submissions,
    activeOperation,
  });
  const scopedQueries = {
    ...queries,
    assignments: scopedLogs.assignments,
    submissions: scopedLogs.submissions,
  };

  const view = buildUnitWorkspaceView({ unit, queries: scopedQueries, search, now });

  return {
    ...view,
    operationContext: activeOperation.operationContext,
  };
}
