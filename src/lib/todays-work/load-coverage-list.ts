import {
  buildDashboardAggregates,
  getTodayWindow,
  loadDashboardQueries,
  type OperationContext,
} from "@/lib/operations-center";
import { applyOperationScopedFacilityQueries } from "@/lib/operations/apply-operation-scoped-facility-queries";
import { resolveOperationsCenterActiveOperation } from "@/lib/operations/resolve-operations-center-active-operation";
import { resolveStaffingMealScope, scopeStaffingQueries } from "@/lib/operations/scope-staffing-queries";
import { prisma } from "@/lib/prisma";

import {
  buildCoverageItems,
  summarizeCoverage,
  type CoverageData,
  type CoverageItem,
  type CoverageSummary,
} from "./coverage-list";

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function loadCoverageList(facilityId: string): Promise<CoverageData> {
  const window = getTodayWindow();
  const now = new Date();
  const dateIso = toIsoDate(window.start);

  const [queries, schedules, overrides] = await Promise.all([
    loadDashboardQueries(facilityId, window),
    prisma.scheduleEntry.findMany({
      where: { date: { gte: window.start, lt: window.end }, unit: { facilityId } },
      orderBy: [{ unitId: "asc" }, { shift: "asc" }],
      select: {
        employeeId: true,
        unitId: true,
        shift: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.assignmentOverride.findMany({
      where: { date: { gte: window.start, lt: window.end }, employee: { facilityId } },
      select: {
        employeeId: true,
        oldUnitId: true,
        newUnitId: true,
        mealType: true,
      },
    }),
  ]);

  const preliminary = buildDashboardAggregates({ ...queries, now });
  const activeOperation = await resolveOperationsCenterActiveOperation(prisma, {
    facilityId,
    now,
    unitCards: preliminary.unitCards,
    mealBoards: preliminary.mealBoards,
  });
  const scopedQueries = applyOperationScopedFacilityQueries(queries, activeOperation);
  const dashboard = buildDashboardAggregates({ ...scopedQueries, now });
  const mealScope = resolveStaffingMealScope(activeOperation);
  const scheduleRows = schedules.map((entry) => ({
    employeeId: entry.employeeId,
    unitId: entry.unitId,
    shift: entry.shift,
    employeeFirstName: entry.employee.firstName,
    employeeLastName: entry.employee.lastName,
  }));
  const scopedStaffing = scopeStaffingQueries({
    schedules: scheduleRows,
    overrides,
    activeOperation,
  });

  const items = buildCoverageItems({
    unitCards: dashboard.unitCards,
    schedules: scopedStaffing.schedules,
    overrides: scopedStaffing.overrides,
    dateIso,
    mealScope,
  });

  return {
    items,
    summary: summarizeCoverage(items),
    operationContext: activeOperation.operationContext,
    priorityGap: items.find((item) => item.level !== "covered") ?? null,
    dateIso,
  };
}

export type { CoverageData, CoverageItem, CoverageSummary, OperationContext };
