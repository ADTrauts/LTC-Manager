import type { OperationalDepartmentKey } from "@/lib/department-nav";
import {
  buildDashboardAggregates,
  loadDashboardQueries,
  type OperationsCenterDashboardData,
} from "@/lib/operations-center";
import { applyOperationScopedFacilityQueries } from "@/lib/operations/apply-operation-scoped-facility-queries";
import { resolveOperationsCenterActiveOperation } from "@/lib/operations/resolve-operations-center-active-operation";
import { scopeStaffingQueries } from "@/lib/operations/scope-staffing-queries";
import {
  buildOperationalTimeContext,
  getFacilityLocalTodayWindow,
  loadFacilityTimezone,
  type OperationalTimeContext,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import {
  buildSitePulseFromReadinessSummary,
  computeReadinessBatch,
  type ReadinessBatchResult,
} from "@/lib/readiness";
import { buildCallDownItems, summarizeCallDowns, type CallDownSummary } from "@/lib/todays-work/call-down";
import { buildCoverageItems } from "@/lib/todays-work/coverage-list";

export type WorkspaceOpenRepair = {
  id: string;
  unitId: string;
  title: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "OPEN" | "IN_PROGRESS" | "WAITING_PARTS" | "CLOSED";
  workOrderKind: "CORRECTIVE" | "PREVENTIVE";
  dueAt: Date | null;
  unitName: string | null;
  departmentKey: string | null;
};

export type WorkspaceInspectionDue = {
  id: string;
  definitionName: string;
  unitName: string | null;
  dueAt: Date;
  overdue: boolean;
};

export type WorkspaceActivityRaw = {
  repairsOpened: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    unitName: string;
    at: Date;
  }>;
  repairsResolved: Array<{
    id: string;
    title: string;
    priority: string;
    unitName: string;
    at: Date;
  }>;
  inspectionsCompleted: Array<{
    id: string;
    title: string;
    result: string;
    unitName: string | null;
    at: Date;
  }>;
  knowledgePublished: Array<{
    id: string;
    title: string;
    category: string;
    at: Date;
  }>;
};

export type BusinessWorkspaceInputs = {
  facilityId: string;
  facilityName: string;
  facilityTimezone: string;
  now: Date;
  operationalTime: OperationalTimeContext;
  activeDepartmentKey?: OperationalDepartmentKey | null;
  activeDepartmentName?: string | null;
  dashboard: OperationsCenterDashboardData;
  readiness: ReadinessBatchResult;
  callDownSummary: CallDownSummary;
  openRepairs: WorkspaceOpenRepair[];
  inspectionsDue: WorkspaceInspectionDue[];
  activeDepartmentKeys: OperationalDepartmentKey[];
  activity: WorkspaceActivityRaw;
};

function isOperationalDepartmentKey(value: string): value is OperationalDepartmentKey {
  return value === "DIETARY" || value === "EVS" || value === "PLANT";
}

/**
 * Single coordinated facility/day pipeline for Business Workspace.
 * Loads dashboard queries once; builds OC aggregates + readiness + call-downs from shared results.
 */
export async function loadBusinessWorkspaceInputs(input: {
  facilityId: string;
  facilityName: string;
  activeDepartmentKey?: OperationalDepartmentKey | null;
  activeDepartmentName?: string | null;
}): Promise<BusinessWorkspaceInputs> {
  const now = new Date();
  const facilityTimezone = await loadFacilityTimezone(prisma, input.facilityId);
  const window = getFacilityLocalTodayWindow(facilityTimezone, now);
  const operationalTime = buildOperationalTimeContext({ now, facilityTimezone });
  const dateIso = operationalTime.facilityLocalDate;
  const lookback = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [queries, schedules, overrides, departments, inspectionsDueRows, activityBundle] =
    await Promise.all([
      loadDashboardQueries(input.facilityId, window, { facilityTimezone, now }),
      prisma.scheduleEntry.findMany({
        where: { date: { gte: window.start, lt: window.end }, unit: { facilityId: input.facilityId } },
        select: {
          employeeId: true,
          unitId: true,
          shift: true,
          employee: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.assignmentOverride.findMany({
        where: {
          date: { gte: window.start, lt: window.end },
          employee: { facilityId: input.facilityId },
        },
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
      prisma.department.findMany({
        where: { facilityId: input.facilityId, isActive: true, showInEmployeeApp: true },
        select: { key: true, name: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.inspectionOccurrence.findMany({
        where: {
          facilityId: input.facilityId,
          status: "OPEN",
          dueAt: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
        },
        orderBy: { dueAt: "asc" },
        take: 20,
        select: {
          id: true,
          dueAt: true,
          definition: { select: { name: true } },
          unit: { select: { name: true } },
        },
      }),
      Promise.all([
        prisma.repair.findMany({
          where: {
            unit: { facilityId: input.facilityId },
            createdAt: { gte: lookback },
            priority: { in: ["HIGH", "URGENT"] },
          },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: {
            id: true,
            title: true,
            priority: true,
            status: true,
            createdAt: true,
            unit: { select: { name: true } },
          },
        }),
        prisma.repair.findMany({
          where: {
            unit: { facilityId: input.facilityId },
            status: "CLOSED",
            updatedAt: { gte: lookback },
            priority: { in: ["HIGH", "URGENT", "MEDIUM"] },
          },
          orderBy: { updatedAt: "desc" },
          take: 6,
          select: {
            id: true,
            title: true,
            priority: true,
            updatedAt: true,
            unit: { select: { name: true } },
          },
        }),
        prisma.inspectionSubmission.findMany({
          where: { facilityId: input.facilityId, submittedAt: { gte: lookback } },
          orderBy: { submittedAt: "desc" },
          take: 6,
          select: {
            id: true,
            result: true,
            submittedAt: true,
            definition: { select: { name: true } },
            unit: { select: { name: true } },
          },
        }),
        prisma.knowledgeArticle.findMany({
          where: {
            facilityId: input.facilityId,
            status: "PUBLISHED",
            updatedAt: { gte: lookback },
          },
          orderBy: { updatedAt: "desc" },
          take: 4,
          select: { id: true, title: true, category: true, updatedAt: true },
        }),
      ]),
    ]);

  const preliminary = buildDashboardAggregates({ ...queries, now, facilityTimezone });
  const activeOperation = await resolveOperationsCenterActiveOperation(prisma, {
    facilityId: input.facilityId,
    now,
    unitCards: preliminary.unitCards,
    mealBoards: preliminary.mealBoards,
    facilityTimezone,
  });
  const scopedQueries = applyOperationScopedFacilityQueries(queries, activeOperation);
  const dashboardCore = buildDashboardAggregates({ ...scopedQueries, now, facilityTimezone });

  // Null department key keeps unit profile keys (DIETARY/EVS/PLANT) for department health.
  const readiness = computeReadinessBatch({
    ...scopedQueries,
    now,
    activeDepartmentKey: null,
    facilityTimezone,
    operationContextOverride: activeOperation.operationContext,
  });

  const deptScopedReadiness =
    input.activeDepartmentKey != null
      ? computeReadinessBatch({
          ...scopedQueries,
          now,
          activeDepartmentKey: input.activeDepartmentKey,
          facilityTimezone,
          operationContextOverride: activeOperation.operationContext,
        })
      : readiness;

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
    unitCards: dashboardCore.unitCards,
    schedules: scopedStaffing.schedules,
    overrides: scopedStaffing.overrides,
    dateIso,
  });
  const coverageByUnitId = new Map(coverageItems.map((item) => [item.unitId, item.level]));
  const callDownItems = buildCallDownItems({
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
  const callDownSummary = summarizeCallDowns(callDownItems);

  const unitNameById = new Map(queries.units.map((unit) => [unit.id, unit.name]));
  const openRepairs: WorkspaceOpenRepair[] = queries.openRepairs.map((row) => ({
    id: row.id,
    unitId: row.unitId,
    title: row.title,
    priority: row.priority,
    status: row.status,
    workOrderKind: row.workOrderKind,
    dueAt: row.dueAt ?? null,
    unitName: unitNameById.get(row.unitId) ?? null,
    departmentKey: row.responsibleDepartment?.key ?? null,
  }));

  const dashboard: OperationsCenterDashboardData = {
    ...dashboardCore,
    operationContext: activeOperation.operationContext,
    sitePulse: buildSitePulseFromReadinessSummary(deptScopedReadiness.summary),
    callDowns: {
      items: callDownItems,
      summary: callDownSummary,
      dateIso,
    },
  };

  const [repairsOpened, repairsResolved, inspectionsCompleted, knowledgePublished] = activityBundle;

  const activeDepartmentKeys = departments
    .map((d) => d.key)
    .filter(isOperationalDepartmentKey);

  return {
    facilityId: input.facilityId,
    facilityName: input.facilityName,
    facilityTimezone,
    now,
    operationalTime,
    activeDepartmentKey: input.activeDepartmentKey,
    activeDepartmentName: input.activeDepartmentName,
    dashboard,
    readiness,
    callDownSummary,
    openRepairs,
    inspectionsDue: inspectionsDueRows.map((row) => ({
      id: row.id,
      definitionName: row.definition.name,
      unitName: row.unit?.name ?? null,
      dueAt: row.dueAt,
      overdue: row.dueAt.getTime() < now.getTime(),
    })),
    activeDepartmentKeys:
      activeDepartmentKeys.length > 0 ? activeDepartmentKeys : (["DIETARY", "EVS", "PLANT"] as OperationalDepartmentKey[]),
    activity: {
      repairsOpened: repairsOpened.map((row) => ({
        id: row.id,
        title: row.title,
        priority: row.priority,
        status: row.status,
        unitName: row.unit.name,
        at: row.createdAt,
      })),
      repairsResolved: repairsResolved.map((row) => ({
        id: row.id,
        title: row.title,
        priority: row.priority,
        unitName: row.unit.name,
        at: row.updatedAt,
      })),
      inspectionsCompleted: inspectionsCompleted.map((row) => ({
        id: row.id,
        title: row.definition.name,
        result: String(row.result),
        unitName: row.unit?.name ?? null,
        at: row.submittedAt,
      })),
      knowledgePublished: knowledgePublished.map((row) => ({
        id: row.id,
        title: row.title,
        category: String(row.category),
        at: row.updatedAt,
      })),
    },
  };
}
