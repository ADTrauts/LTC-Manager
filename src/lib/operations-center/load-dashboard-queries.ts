import { EmployeeStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { TodayWindow } from "./get-today-window";

export type DashboardQueryResult = Awaited<ReturnType<typeof loadDashboardQueries>>;

export async function loadDashboardQueries(facilityId: string, window: TodayWindow) {
  const month = new Date().getMonth() + 1;

  const [
    units,
    assignments,
    submissionsToday,
    scheduleEntriesToday,
    overridesToday,
    openRepairs,
    birthdaysThisMonth,
    serveryMealServiceEventsToday,
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
    managerCount,
    month,
  };
}
