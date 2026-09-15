import { EmployeeStatus, type MealType, type Prisma } from "@prisma/client";

import { operationalUnitWhere } from "@/lib/facility-builder/operational-visibility";
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

/**
 * Resolve the Unit where-clauses this loader uses, honouring the canonical operational hierarchy.
 *
 * Exported so the RUN-surface contract can be tested without a database: the legacy (non-projected)
 * path must exclude Units retired to a builder-only hierarchy role (STAGED) even while `isActive`
 * remains true, so Dashboard (`/workspace`) and Today's Work (`/today`) — which still fall back to
 * this loader — never present retired locations as currently active. When a Projection scope is
 * supplied, `projectedUnitIds` has already excluded ineligible Units, so we only intersect by id.
 */
export function resolveDashboardUnitScopes(
  facilityId: string,
  projectedUnitIds: readonly string[] | undefined,
): { unitWhere: Prisma.UnitWhereInput; unitRelationScope: Prisma.UnitWhereInput } {
  const unitScope =
    projectedUnitIds === undefined
      ? undefined
      : projectedUnitIds.length === 0
        ? { id: { in: [] as string[] } }
        : { id: { in: [...projectedUnitIds] } };
  const unitWhere = operationalUnitWhere(facilityId, { isActive: true, ...unitScope });
  const unitRelationScope: Prisma.UnitWhereInput =
    projectedUnitIds === undefined
      ? operationalUnitWhere(facilityId)
      : projectedUnitIds.length === 0
        ? { facilityId, id: { in: [] as string[] } }
        : { facilityId, id: { in: [...projectedUnitIds] } };
  return { unitWhere, unitRelationScope };
}

export async function loadDashboardQueries(
  facilityId: string,
  window: TodayWindow,
  options?: LoadDashboardQueriesOptions,
) {
  const month = new Date().getMonth() + 1;
  const now = options?.now ?? new Date();
  const roomAreaServiceDate = getFacilityServiceDate(options?.facilityTimezone, now);
  const projectedUnitIds = options?.projectedUnitIds;
  const { unitWhere, unitRelationScope } = resolveDashboardUnitScopes(facilityId, projectedUnitIds);

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
      where: unitWhere,
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        name: true,
        unitType: true,
        parentUnitId: true,
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
    // Legacy rows (unit-placed shifts) only. Filtering on `unit` already excludes
    // canonical Shifts with null unitId (no Unit relation to match).
    prisma.scheduleEntry.findMany({
      where: {
        date: { gte: window.start, lt: window.end },
        unit: unitRelationScope,
      },
      select: { unitId: true, shift: true },
    }).then((rows) =>
      rows.filter((row): row is typeof row & { unitId: string } => row.unitId != null),
    ),
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

  const unitsWithTiming = await overlayDashboardMealTimings({
    facilityId,
    facilityTimezone: options?.facilityTimezone ?? null,
    now,
    units,
    events: serveryMealServiceEventsToday,
  });

  return {
    units: unitsWithTiming,
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

async function overlayDashboardMealTimings<
  TUnit extends {
    id: string;
    parentUnitId: string | null;
    mealTimes: Array<{ mealType: MealType; scheduledTime: string }>;
  },
  TEvent extends {
    unitId: string;
    mealType: MealType;
    mealServiceStartedAt: Date | null;
  },
>(input: {
  facilityId: string;
  facilityTimezone: string | null;
  now: Date;
  units: TUnit[];
  events: TEvent[];
}): Promise<TUnit[]> {
  const dietary = await prisma.department.findFirst({
    where: { facilityId: input.facilityId, key: "DIETARY", isActive: true },
    select: { id: true },
  });
  if (!dietary) return input.units;

  const { materializeMealServiceDayExpectations, timingsForOwnerUnits } =
    await import("@/lib/operational-cycles/materialize-day-expectations");
  const { timingOwnerUnitIds } = await import("@/lib/operational-cycles/plan-day-expectations");
  const { describeMealServiceTiming, localHhMmFromInstant } = await import(
    "@/lib/operational-cycles/day-expectation"
  );

  let materialized;
  try {
    materialized = await materializeMealServiceDayExpectations({
      facilityId: input.facilityId,
      departmentId: dietary.id,
      now: input.now,
    });
  } catch (error) {
    // Stale Prisma client / missing table must not take down the whole workspace.
    console.warn("[dashboard] meal timing overlay skipped:", error);
    return input.units;
  }
  if (materialized.timings.length === 0) return input.units;

  const timezone = input.facilityTimezone ?? "UTC";
  return input.units.map((unit) => {
    const ownerIds = timingOwnerUnitIds({
      id: unit.id,
      parentUnitId: unit.parentUnitId,
    });
    const unitTimings = timingsForOwnerUnits(materialized.timings, ownerIds);
    if (unitTimings.length === 0) return unit;

    const relatedIds = new Set(ownerIds);
    return {
      ...unit,
      mealTimes: unitTimings.map((timing) => {
        const event = input.events.find(
          (row) => relatedIds.has(row.unitId) && row.mealType === timing.mealType,
        );
        const actualTime = event?.mealServiceStartedAt
          ? localHhMmFromInstant(event.mealServiceStartedAt, timezone)
          : null;
        const status = describeMealServiceTiming({
          configuredTime: timing.configuredTime,
          adjustedTime: timing.adjustedTime,
          actualLocalHhMm: actualTime,
        });
        return {
          mealType: timing.mealType as TUnit["mealTimes"][number]["mealType"],
          scheduledTime: timing.expectedToday ?? "",
          configuredTime: timing.configuredTime,
          adjustedTime: timing.adjustedTime,
          actualTime,
          timingStatusLabel: status.label,
        };
      }),
    } as TUnit;
  });
}
