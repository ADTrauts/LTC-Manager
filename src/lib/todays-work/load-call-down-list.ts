import {
  buildDashboardAggregates,
  loadDashboardQueries,
} from "@/lib/operations-center";
import { applyOperationScopedFacilityQueries } from "@/lib/operations/apply-operation-scoped-facility-queries";
import { resolveOperationsCenterActiveOperation } from "@/lib/operations/resolve-operations-center-active-operation";
import { scopeStaffingQueries } from "@/lib/operations/scope-staffing-queries";
import {
  buildOperationalTimeContext,
  getFacilityLocalTodayWindow,
  loadFacilityTimezone,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { buildCoverageItems } from "./coverage-list";
import {
  buildCallDownItems,
  summarizeCallDowns,
  type CallDownData,
  type CallDownItem,
  type CallDownSummary,
} from "./call-down";

export async function loadCallDownList(facilityId: string): Promise<CallDownData> {
  const now = new Date();
  const facilityTimezone = await loadFacilityTimezone(prisma, facilityId);
  const window = getFacilityLocalTodayWindow(facilityTimezone, now);
  const dateIso = buildOperationalTimeContext({ now, facilityTimezone }).facilityLocalDate;

  const [queries, schedules, overrides] = await Promise.all([
    loadDashboardQueries(facilityId, window),
    prisma.scheduleEntry.findMany({
      where: { date: { gte: window.start, lt: window.end }, unit: { facilityId } },
      select: {
        employeeId: true,
        unitId: true,
        shift: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.assignmentOverride.findMany({
      where: { date: { gte: window.start, lt: window.end }, employee: { facilityId } },
      orderBy: { changedAt: "desc" },
      select: {
        id: true,
        employeeId: true,
        oldUnitId: true,
        newUnitId: true,
        mealType: true,
        reason: true,
        changedAt: true,
        employee: { select: { firstName: true, lastName: true } },
        oldUnit: { select: { name: true } },
        newUnit: { select: { name: true } },
      },
    }),
  ]);

  const preliminary = buildDashboardAggregates({ ...queries, now, facilityTimezone });
  const activeOperation = await resolveOperationsCenterActiveOperation(prisma, {
    facilityId,
    now,
    unitCards: preliminary.unitCards,
    mealBoards: preliminary.mealBoards,
    facilityTimezone,
  });
  const scopedQueries = applyOperationScopedFacilityQueries(queries, activeOperation);
  const dashboard = buildDashboardAggregates({ ...scopedQueries, now, facilityTimezone });
  const scheduleRows = schedules.map((entry) => ({
    employeeId: entry.employeeId,
    unitId: entry.unitId,
    shift: entry.shift,
    employeeFirstName: entry.employee.firstName,
    employeeLastName: entry.employee.lastName,
  }));
  const scopedStaffing = scopeStaffingQueries({
    schedules: scheduleRows,
    overrides: overrides.map((entry) => ({
      employeeId: entry.employeeId,
      oldUnitId: entry.oldUnitId,
      newUnitId: entry.newUnitId,
      mealType: entry.mealType,
    })),
    activeOperation,
  });
  const coverageItems = buildCoverageItems({
    unitCards: dashboard.unitCards,
    schedules: scopedStaffing.schedules,
    overrides: scopedStaffing.overrides,
    dateIso,
  });
  const coverageByUnitId = new Map(coverageItems.map((item) => [item.unitId, item.level]));

  const items = buildCallDownItems({
    overrides: overrides.map((entry) => ({
      id: entry.id,
      employeeId: entry.employeeId,
      employeeFirstName: entry.employee.firstName,
      employeeLastName: entry.employee.lastName,
      oldUnitId: entry.oldUnitId,
      oldUnitName: entry.oldUnit?.name ?? null,
      newUnitId: entry.newUnitId,
      newUnitName: entry.newUnit.name,
      mealType: entry.mealType,
      reason: entry.reason,
      changedAt: entry.changedAt,
    })),
    coverageByUnitId,
    dateIso,
  });

  return {
    items,
    summary: summarizeCallDowns(items),
    dateIso,
  };
}

export type { CallDownData, CallDownItem, CallDownSummary };
