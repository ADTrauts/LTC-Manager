import {
  buildDashboardAggregates,
  getTodayWindow,
  loadDashboardQueries,
} from "@/lib/operations-center";
import { prisma } from "@/lib/prisma";

import { buildCoverageItems } from "./coverage-list";
import {
  buildCallDownItems,
  summarizeCallDowns,
  type CallDownData,
  type CallDownItem,
  type CallDownSummary,
} from "./call-down";

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function loadCallDownList(facilityId: string): Promise<CallDownData> {
  const window = getTodayWindow();
  const now = new Date();
  const dateIso = toIsoDate(window.start);

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

  const dashboard = buildDashboardAggregates({ ...queries, now });
  const coverageItems = buildCoverageItems({
    unitCards: dashboard.unitCards,
    schedules: schedules.map((entry) => ({
      employeeId: entry.employeeId,
      unitId: entry.unitId,
      shift: entry.shift,
      employeeFirstName: entry.employee.firstName,
      employeeLastName: entry.employee.lastName,
    })),
    overrides: overrides.map((entry) => ({
      employeeId: entry.employeeId,
      oldUnitId: entry.oldUnitId,
      newUnitId: entry.newUnitId,
      mealType: entry.mealType,
    })),
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
