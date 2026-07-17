import { EmployeeStatus } from "@prisma/client";

import { getFacilityServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import type { TodayWindow } from "./get-today-window";

export type DashboardQueryResult = Awaited<ReturnType<typeof loadDashboardQueries>>;

export type LoadDashboardQueriesOptions = {
  /** IANA timezone used to resolve the facility-local RoomAreaStatus service date. */
  facilityTimezone?: string | null;
  now?: Date;
  /**
   * Wave 15J — when provided, constrain Unit-scoped operational queries early.
   * Empty array = empty Projection (valid): return no operational domain rows.
   * Omitted = legacy facility-wide load.
   */
  projectedUnitIds?: readonly string[];
};

export async function loadDashboardQueries(
  facilityId: string,
  window: TodayWindow,
  options?: LoadDashboardQueriesOptions,
) {
  const month = new Date().getMonth() + 1;
  const now = options?.now ?? new Date();
  const roomAreaServiceDate = getFacilityServiceDate(options?.facilityTimezone, now);
  const projectedUnitIds = options?.projectedUnitIds;
  const unitScope =
    projectedUnitIds === undefined
      ? undefined
      : projectedUnitIds.length === 0
        ? { id: { in: [] as string[] } }
        : { id: { in: [...projectedUnitIds] } };
  const unitRelationScope =
    projectedUnitIds === undefined
      ? { facilityId }
      : projectedUnitIds.length === 0
        ? { facilityId, id: { in: [] as string[] } }
        : { facilityId, id: { in: [...projectedUnitIds] } };

  const [
    units,
    assignments,
    submissionsToday,
    scheduleEntriesToday,
    overridesToday,
    openRepairs,
    birthdaysThisMonth,
    serveryMealServiceEventsToday,
    roomAreaStatusesToday,
    outOfServiceAssets,
    pmSchedulesDueThroughToday,
    managerCount,
  ] = await Promise.all([
    prisma.unit.findMany({
      where: { isActive: true, facilityId, ...unitScope },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        name: true,
        unitType: true,
        mealTimes: {
          where: { isActive: true },
          orderBy: { mealType: "asc" },
          select: { mealType: true, scheduledTime: true },
        },
        departmentResponsibilities: {
          select: { department: { select: { key: true } } },
        },
      },
    }),
    prisma.logAssignment.findMany({
      where: { isActive: true, unit: unitRelationScope },
      select: {
        id: true,
        unitId: true,
        templateId: true,
        mealType: true,
        timesPerDay: true,
        template: { select: { name: true } },
      },
    }),
    prisma.logSubmission.findMany({
      where: {
        serviceDate: { gte: window.start, lt: window.end },
        unit: unitRelationScope,
      },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        assignmentId: true,
        unitId: true,
        status: true,
        mealType: true,
      },
    }),
    prisma.scheduleEntry.findMany({
      where: {
        date: { gte: window.start, lt: window.end },
        unit: unitRelationScope,
      },
      select: { unitId: true, shift: true },
    }),
    prisma.assignmentOverride.findMany({
      where: {
        date: { gte: window.start, lt: window.end },
        employee: { facilityId },
        ...(projectedUnitIds === undefined
          ? {}
          : {
              OR: [
                { newUnitId: { in: [...projectedUnitIds] } },
                { oldUnitId: { in: [...projectedUnitIds] } },
              ],
            }),
      },
      select: { oldUnitId: true, newUnitId: true, mealType: true },
    }),
    prisma.repair.findMany({
      where: { status: { not: "CLOSED" }, unit: unitRelationScope },
      select: {
        id: true,
        unitId: true,
        title: true,
        priority: true,
        status: true,
        workOrderKind: true,
        assignedEmployeeId: true,
        dueAt: true,
        preventiveScheduleId: true,
        responsibleDepartment: { select: { key: true } },
        assetId: true,
        asset: { select: { name: true, status: true, criticality: true } },
      },
    }),
    prisma.employee.findMany({
      where: {
        facilityId,
        status: EmployeeStatus.ACTIVE,
        birthMonth: month,
        birthDay: { not: null },
      },
      orderBy: [{ birthDay: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, birthDay: true },
    }),
    prisma.serveryMealServiceEvent.findMany({
      where: {
        serviceDate: { gte: window.start, lt: window.end },
        unit: unitRelationScope,
      },
      select: {
        unitId: true,
        mealType: true,
        mealServiceReadyAt: true,
        mealServiceStartedAt: true,
      },
    }),
    prisma.roomAreaStatus.findMany({
      where: {
        facilityId,
        statusDate: roomAreaServiceDate,
        ...(projectedUnitIds === undefined
          ? {}
          : { unitId: { in: [...projectedUnitIds] } }),
      },
      select: {
        unitId: true,
        status: true,
        notes: true,
        updatedAt: true,
        statusDate: true,
      },
    }),
    prisma.asset.findMany({
      where: {
        unit: unitRelationScope,
        status: "OUT_OF_SERVICE",
      },
      select: {
        id: true,
        unitId: true,
        name: true,
        status: true,
        criticality: true,
        equipmentType: true,
      },
    }),
    prisma.preventiveMaintenanceSchedule.findMany({
      where: {
        facilityId,
        isActive: true,
        // Exclude future PM beyond the facility-local today window.
        nextDueAt: { lt: window.end },
        ...(projectedUnitIds === undefined
          ? {}
          : { asset: { unitId: { in: [...projectedUnitIds] } } }),
      },
      select: {
        id: true,
        name: true,
        nextDueAt: true,
        asset: { select: { unitId: true, name: true, status: true, criticality: true } },
      },
    }),
    prisma.user.count({
      where: { facilityId, role: { key: "MANAGER" }, isActive: true },
    }),
  ]);

  return {
    units,
    assignments,
    submissionsToday,
    scheduleEntriesToday,
    overridesToday,
    openRepairs,
    birthdaysThisMonth,
    serveryMealServiceEventsToday,
    roomAreaStatusesToday,
    outOfServiceAssets,
    pmSchedulesDueThroughToday,
    managerCount,
    month,
  };
}
