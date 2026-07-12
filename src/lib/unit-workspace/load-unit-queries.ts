import type { UnitType } from "@prisma/client";

import { loadFacilityMenuData } from "@/lib/menu-db";
import { getFacilityServiceDate } from "@/lib/operational-time";
import type { TodayWindow } from "@/lib/operations-center";
import { prisma } from "@/lib/prisma";

export type UnitQueryResult = Awaited<ReturnType<typeof loadUnitQueries>>;

export async function loadUnitQueries(params: {
  unitId: string;
  facilityId: string;
  unitType: UnitType;
  window: TodayWindow;
  facilityTimezone?: string | null;
  now?: Date;
}) {
  const { unitId, facilityId, unitType, window } = params;
  const { start, end } = window;
  const now = params.now ?? new Date();
  const roomAreaServiceDate = getFacilityServiceDate(params.facilityTimezone, now);

  const [
    assignments,
    submissions,
    schedulesToday,
    overridesToday,
    openRepairs,
    mealServiceEventsToday,
    mealServiceHistory,
    logHistory,
    roomAreaStatusToday,
    outOfServiceAssets,
    pmSchedulesDueThroughToday,
    menuData,
  ] = await Promise.all([
    prisma.logAssignment.findMany({
      where: {
        unitId,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        recurrence: true,
        mealType: true,
        timesPerDay: true,
        template: { select: { name: true, category: true } },
      },
    }),
    prisma.logSubmission.findMany({
      where: {
        unitId,
        serviceDate: { gte: start, lt: end },
      },
      orderBy: { submittedAt: "desc" },
      take: 15,
      select: {
        id: true,
        status: true,
        submittedAt: true,
        assignmentId: true,
        mealType: true,
        template: { select: { name: true } },
        submittedBy: { select: { displayName: true } },
      },
    }),
    prisma.scheduleEntry.findMany({
      where: { unitId, date: { gte: start, lt: end } },
      include: {
        employee: { select: { firstName: true, lastName: true, roleType: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.assignmentOverride.findMany({
      where: {
        date: { gte: start, lt: end },
        employee: { facilityId },
        OR: [{ newUnitId: unitId }, { oldUnitId: unitId }],
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
      },
      orderBy: { changedAt: "desc" },
    }),
    prisma.repair.findMany({
      where: {
        unitId,
        status: { not: "CLOSED" },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        repairCode: true,
        title: true,
        priority: true,
        status: true,
        workOrderKind: true,
        assignedEmployeeId: true,
        dueAt: true,
        preventiveScheduleId: true,
        assetId: true,
      },
    }),
    unitType === "SERVERY"
      ? prisma.serveryMealServiceEvent.findMany({
          where: { unitId, serviceDate: { gte: start, lt: end } },
          select: {
            mealType: true,
            mealServiceReadyAt: true,
            mealServiceStartedAt: true,
          },
        })
      : Promise.resolve([]),
    unitType === "SERVERY"
      ? prisma.serveryMealServiceEvent.findMany({
          where: {
            unitId,
            OR: [{ mealServiceReadyAt: { not: null } }, { mealServiceStartedAt: { not: null } }],
          },
          take: 60,
          orderBy: [{ serviceDate: "desc" }, { mealType: "asc" }, { updatedAt: "desc" }],
          select: {
            id: true,
            serviceDate: true,
            mealType: true,
            mealServiceReadyAt: true,
            mealServiceStartedAt: true,
            readyRecordedBy: { select: { displayName: true } },
            startedRecordedBy: { select: { displayName: true } },
          },
        })
      : Promise.resolve([]),
    prisma.logSubmission.findMany({
      where: { unitId },
      orderBy: { submittedAt: "desc" },
      take: 75,
      select: {
        id: true,
        submittedAt: true,
        status: true,
        template: { select: { name: true, category: true } },
        submittedBy: { select: { displayName: true } },
      },
    }),
    prisma.roomAreaStatus.findFirst({
      where: { unitId, facilityId, statusDate: roomAreaServiceDate },
      select: {
        unitId: true,
        status: true,
        notes: true,
        updatedAt: true,
        statusDate: true,
      },
    }),
    prisma.asset.findMany({
      where: { unitId, status: "OUT_OF_SERVICE" },
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
        nextDueAt: { lt: end },
        asset: { unitId },
      },
      select: {
        id: true,
        name: true,
        nextDueAt: true,
        asset: { select: { unitId: true, name: true, status: true, criticality: true } },
      },
    }),
    loadFacilityMenuData(prisma, facilityId),
  ]);

  return {
    assignments,
    submissions,
    schedulesToday,
    overridesToday,
    openRepairs,
    mealServiceEventsToday,
    mealServiceHistory,
    logHistory,
    roomAreaStatusToday,
    outOfServiceAssets,
    pmSchedulesDueThroughToday,
    menuData,
  };
}
