import { EmployeeStatus } from "@prisma/client";

import { getFacilityServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import type { TodayWindow } from "./get-today-window";

export type DashboardQueryResult = Awaited<ReturnType<typeof loadDashboardQueries>>;

export type LoadDashboardQueriesOptions = {
  /** IANA timezone used to resolve the facility-local RoomAreaStatus service date. */
  facilityTimezone?: string | null;
  now?: Date;
};

export async function loadDashboardQueries(
  facilityId: string,
  window: TodayWindow,
  options?: LoadDashboardQueriesOptions,
) {
  const month = new Date().getMonth() + 1;
  const now = options?.now ?? new Date();
  const roomAreaServiceDate = getFacilityServiceDate(options?.facilityTimezone, now);

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
    managerCount,
  ] = await Promise.all([
    prisma.unit.findMany({
      where: { isActive: true, facilityId },
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
      where: { isActive: true, unit: { facilityId } },
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
      where: { serviceDate: { gte: window.start, lt: window.end }, unit: { facilityId } },
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
      where: { date: { gte: window.start, lt: window.end }, unit: { facilityId } },
      select: { unitId: true, shift: true },
    }),
    prisma.assignmentOverride.findMany({
      where: { date: { gte: window.start, lt: window.end }, employee: { facilityId } },
      select: { oldUnitId: true, newUnitId: true, mealType: true },
    }),
    prisma.repair.findMany({
      where: { status: { not: "CLOSED" }, unit: { facilityId } },
      select: {
        id: true,
        unitId: true,
        title: true,
        priority: true,
        status: true,
        workOrderKind: true,
        assignedEmployeeId: true,
        dueAt: true,
        responsibleDepartment: { select: { key: true } },
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
        unit: { facilityId },
      },
      select: {
        unitId: true,
        mealType: true,
        mealServiceReadyAt: true,
        mealServiceStartedAt: true,
      },
    }),
    prisma.roomAreaStatus.findMany({
      where: { facilityId, statusDate: roomAreaServiceDate },
      select: {
        unitId: true,
        status: true,
        notes: true,
        updatedAt: true,
        statusDate: true,
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
    managerCount,
    month,
  };
}
