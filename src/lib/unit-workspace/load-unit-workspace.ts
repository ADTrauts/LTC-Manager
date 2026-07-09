import { getTodayWindow } from "@/lib/operations-center";
import { resolveUnitWorkspaceActiveOperation } from "@/lib/operations/resolve-unit-workspace-active-operation";
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

  const view = buildUnitWorkspaceView({ unit, queries, search });
  const activeOperation = await resolveUnitWorkspaceActiveOperation(prisma, {
    facilityId,
    unit: view.unit,
    mealServiceEventByMeal: view.mealServiceEventByMeal,
    now: view.now,
  });

  return {
    ...view,
    operationContext: activeOperation.operationContext,
  };
}
