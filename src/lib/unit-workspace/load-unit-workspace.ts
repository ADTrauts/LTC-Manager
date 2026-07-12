import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { resolveUnitWorkspaceActiveOperation } from "@/lib/operations/resolve-unit-workspace-active-operation";
import { scopeLogDueQueries } from "@/lib/operations/scope-log-due-queries";
import { scopeStaffingQueries } from "@/lib/operations/scope-staffing-queries";
import { getFacilityLocalTodayWindow, loadFacilityTimezone } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { buildUnitWorkspaceView } from "./build-unit-workspace-view";
import { loadUnitQueries } from "./load-unit-queries";
import { loadUnitRecord } from "./load-unit-record";
import type { UnitWorkspaceSearchParams, UnitWorkspaceViewModel } from "./types";

export async function loadUnitWorkspace(
  facilityId: string,
  unitId: string,
  search: UnitWorkspaceSearchParams = {},
  options?: {
    activeDepartmentKey?: OperationalDepartmentKey | null;
  },
): Promise<UnitWorkspaceViewModel | null> {
  const unit = await loadUnitRecord(facilityId, unitId);
  if (!unit) {
    return null;
  }

  const now = new Date();
  const facilityTimezone = await loadFacilityTimezone(prisma, facilityId);
  const window = getFacilityLocalTodayWindow(facilityTimezone, now);
  const queries = await loadUnitQueries({
    unitId: unit.id,
    facilityId,
    unitType: unit.unitType,
    window,
    facilityTimezone,
    now,
  });

  const preliminaryView = buildUnitWorkspaceView({
    unit,
    queries,
    search,
    now,
    facilityTimezone,
    facilityId,
    activeDepartmentKey: options?.activeDepartmentKey,
  });
  const activeOperation = await resolveUnitWorkspaceActiveOperation(prisma, {
    facilityId,
    unit: preliminaryView.unit,
    mealServiceEventByMeal: preliminaryView.mealServiceEventByMeal,
    now: preliminaryView.now,
    facilityTimezone,
  });

  const scopedLogs = scopeLogDueQueries({
    assignments: queries.assignments,
    submissions: queries.submissions,
    activeOperation,
  });
  const scopedStaffing = scopeStaffingQueries({
    schedules: queries.schedulesToday,
    overrides: queries.overridesToday,
    activeOperation,
  });
  const scopedQueries = {
    ...queries,
    assignments: scopedLogs.assignments,
    submissions: scopedLogs.submissions,
    schedulesToday: scopedStaffing.schedules,
    overridesToday: scopedStaffing.overrides,
  };

  const view = buildUnitWorkspaceView({
    unit,
    queries: scopedQueries,
    search,
    now,
    facilityTimezone,
    facilityId,
    activeDepartmentKey: options?.activeDepartmentKey,
  });

  return {
    ...view,
    operationContext: activeOperation.operationContext,
  };
}
