import type { AppJwtPayload } from "@/lib/auth";
import { hasAtLeastRole, type AppRole } from "@/lib/access";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  parseFacilityLocalScheduledStart,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { resolveCycleAuthority } from "./cycle-authority";
import { roomTypeKeyForStoredSpace } from "./cycle-scope";
import {
  describeMealServiceTiming,
  localHhMmFromInstant,
} from "./day-expectation";
import {
  describeKeyTimeStatus,
  summarizeKeyTimeGroups,
  type KeyTimeDayTiming,
  type KeyTimeGroupSummary,
} from "./key-time-day-expectation";
import { loadPublishedCyclesWithKeyTimesForDate } from "./load-published-cycles";
import {
  materializeMealServiceDayExpectations,
  mealTargetsFromTimings,
} from "./materialize-day-expectations";
import { materializeKeyTimeDayExpectations } from "./materialize-key-time-day-expectations";
import {
  cycleMilestoneStatusLabel,
  resolveCycleMilestoneStatus,
  type CycleMilestoneStatusKey,
} from "./milestone-cycle-status";
import { pickTimingForMeal, timingOwnerUnitIds } from "./plan-day-expectations";
import { detectRunModelProvenance, timingsForPublishedKeyTimeCycles } from "./present-run-operation";
import {
  formatCycleHierarchyLabel,
  resolveOperationalCycle,
} from "./resolve-operational-cycle";
import type { DayMealTiming } from "./day-expectation";

export type SupervisorUnitCycleRow = {
  unitId: string;
  unitName: string;
  unitType: string;
  cycleState: string;
  cycleLabel: string | null;
  /** Major operating period label when nested (e.g. Breakfast). */
  parentCycleLabel: string | null;
  /** Full path when nested (e.g. Breakfast → Servery Service). */
  displayPath: string | null;
  mealType: string | null;
  mealTargetTime: string | null;
  configuredTime: string | null;
  adjustedTime: string | null;
  expectedToday: string | null;
  actualStartedTime: string | null;
  timingStatusLabel: string | null;
  adjustedByLabel: string | null;
  expectationId: string | null;
  canAdjust: boolean;
  milestoneStatus: CycleMilestoneStatusKey | null;
  milestoneLabel: string | null;
  exceptionRank: number;
  workspaceHref: string;
  assignmentBoardHref: string;
  builderHref: string;
};

export type SupervisorKeyTimeRoomRow = {
  expectationId: string;
  spaceId: string;
  spaceName: string;
  facilityRoomTypeName: string | null;
  unitName: string | null;
  configuredDueLocal: string;
  adjustedDueLocal: string | null;
  expectedToday: string;
  actualDueLocal: string | null;
  statusLabel: string;
  statusKey: string;
  canAdjust: boolean;
  canComplete: boolean;
};

export type SupervisorKeyTimeGroupCard = KeyTimeGroupSummary & {
  rooms: SupervisorKeyTimeRoomRow[];
};

export type SupervisorCycleOverview = {
  facilityId: string;
  departmentId: string;
  operationalDateKey: string;
  rows: SupervisorUnitCycleRow[];
  keyTimeGroups: SupervisorKeyTimeGroupCard[];
  counts: {
    readyConfirmed: number;
    serviceStarted: number;
    notConfirmed: number;
    late: number;
    missingConfig: number;
    startedWithoutReady: number;
    keyTimesTotal: number;
    keyTimesCompleted: number;
    keyTimesOverdue: number;
  };
};

const EXCEPTION_RANK: Record<string, number> = {
  CONFLICT_REVIEW: 10,
  STARTED_WITHOUT_READY: 20,
  SERVICE_STARTED_LATE: 30,
  NOT_CONFIRMED: 40,
  READY_NOT_CONFIRMED: 40,
  missing_config: 50,
  not_configured: 50,
  CORRECTED: 60,
  READY_CONFIRMED: 80,
  SERVICE_STARTED: 90,
};

/**
 * Supervisor overview across Dietary neighborhoods — exception-first ordering.
 * Meal times come from materialized day expectations, not UnitMealTime.
 */
export async function loadSupervisorCycleOverview(input: {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  now?: Date;
  operationalDateKey?: string;
}): Promise<SupervisorCycleOverview> {
  const authority = await resolveCycleAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewDepartment && !authority.canViewRuntime) {
    throw new Error(authority.reason ?? "Insufficient Operational Cycle authority.");
  }

  const departmentMeta = await prisma.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
    select: { key: true },
  });
  const departmentKey = departmentMeta?.key ?? "DIETARY";

  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const operationalDateKey = input.operationalDateKey ?? todayKey;
  const serviceDate = facilityLocalDateToServiceDate(operationalDateKey);
  const canAdjust =
    operationalDateKey === todayKey &&
    hasAtLeastRole(input.session.role as AppRole, "SUPERVISOR");

  const [cycles, materialized, keyTimeMaterialized] = await Promise.all([
    loadPublishedCyclesWithKeyTimesForDate(
      input.facilityId,
      input.departmentId,
      operationalDateKey,
    ),
    departmentKey === "DIETARY"
      ? materializeMealServiceDayExpectations({
          facilityId: input.facilityId,
          departmentId: input.departmentId,
          operationalDateKey,
          now,
        })
      : Promise.resolve({ operationalDateKey, created: 0, timings: [] as DayMealTiming[] }),
    materializeKeyTimeDayExpectations({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      operationalDateKey,
      now,
    }),
  ]);

  const timings = materialized.timings;
  const runProvenance = detectRunModelProvenance(cycles, keyTimeMaterialized.timings);
  const expectationUnitIds = [...new Set(timings.map((row) => row.unitId))];

  const units = await prisma.unit.findMany({
    where: {
      facilityId: input.facilityId,
      isActive: true,
      ...(expectationUnitIds.length > 0
        ? { id: { in: expectationUnitIds } }
        : departmentKey === "DIETARY"
          ? { unitType: { in: ["SERVERY", "KITCHEN"] as const } }
          : {}),
      departmentResponsibilities: {
        some: { departmentId: input.departmentId },
      },
    },
    select: {
      id: true,
      name: true,
      unitType: true,
      parentUnitId: true,
      mealTimes: {
        where: { isActive: true },
        select: { mealType: true, scheduledTime: true },
      },
      childSpaces: {
        select: { id: true, spaceType: true, customTypeLabel: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const includeMealMilestones = departmentKey === "DIETARY";
  const childUnits = includeMealMilestones
    ? await prisma.unit.findMany({
        where: {
          facilityId: input.facilityId,
          isActive: true,
          parentUnitId: { in: units.map((u) => u.id) },
        },
        select: { id: true, parentUnitId: true },
      })
    : [];
  const eventUnitIds = [
    ...units.map((u) => u.id),
    ...childUnits.map((u) => u.id),
  ];

  const events = includeMealMilestones
    ? await prisma.serveryMealServiceEvent.findMany({
        where: {
          serviceDate,
          unitId: { in: eventUnitIds },
        },
        select: {
          unitId: true,
          mealType: true,
          mealServiceReadyAt: true,
          mealServiceStartedAt: true,
          entries: {
            where: { kind: "CORRECTION" },
            select: { id: true },
            take: 1,
          },
        },
      })
    : [];

  const childIdsByParent = new Map<string, string[]>();
  for (const child of childUnits) {
    if (!child.parentUnitId) continue;
    const list = childIdsByParent.get(child.parentUnitId) ?? [];
    list.push(child.id);
    childIdsByParent.set(child.parentUnitId, list);
  }

  const counts = {
    readyConfirmed: 0,
    serviceStarted: 0,
    notConfirmed: 0,
    late: 0,
    missingConfig: 0,
    startedWithoutReady: 0,
  };

  const rows: SupervisorUnitCycleRow[] = [];

  if (runProvenance !== "NEW_PERIOD_KEY_TIME") {
  for (const unit of units) {
    const ownerIds = timingOwnerUnitIds(unit);
    const unitTimings = timings.filter((row) => ownerIds.includes(row.unitId));
    const mealTargets =
      unitTimings.length > 0
        ? mealTargetsFromTimings(unitTimings, ownerIds).map((row) => ({
            mealType: row.mealType as import("@prisma/client").MealType,
            scheduledTime: row.scheduledTime,
          }))
        : unit.mealTimes;

    const roomTypeKeys = [
      ...new Set(
        unit.childSpaces.map((space) => roomTypeKeyForStoredSpace(space)),
      ),
    ];

    const context = resolveOperationalCycle({
      cycles,
      now,
      facilityTimezone: timezone,
      operationalDateKey,
      unit: {
        id: unit.id,
        unitType: unit.unitType,
        childRoomTypeKeys: roomTypeKeys.length > 0 ? roomTypeKeys : undefined,
        spaceIds: unit.childSpaces.map((space) => space.id),
      },
      mealTargets,
    });

    let cycleLabel: string | null = null;
    let parentCycleLabel: string | null = null;
    let displayPath: string | null = null;
    let mealType: string | null = null;
    let mealTargetTime: string | null = null;
    let configuredTime: string | null = null;
    let adjustedTime: string | null = null;
    let expectedToday: string | null = null;
    let actualStartedTime: string | null = null;
    let timingStatusLabel: string | null = null;
    let adjustedByLabel: string | null = null;
    let expectationId: string | null = null;
    let milestoneStatus: CycleMilestoneStatusKey | null = null;
    let milestoneLabel: string | null = null;
    let exceptionKey = "ok";

    if (context.state === "NOT_CONFIGURED" && unitTimings.length === 0) {
      counts.missingConfig += 1;
      exceptionKey = "missing_config";
    } else if (context.state === "NOT_APPLICABLE" && unitTimings.length === 0) {
      exceptionKey = "ok";
    } else {
      const activeOrNext =
        context.state === "ACTIVE"
          ? context.primary
          : context.state === "UPCOMING" || context.state === "BETWEEN"
            ? context.next
            : context.state === "DAY_COMPLETE"
              ? context.last
              : context.state === "NOT_CONFIGURED" || context.state === "NOT_APPLICABLE"
                ? null
                : null;
      cycleLabel = activeOrNext?.label ?? unitTimings[0]?.cycleLabel ?? null;
      parentCycleLabel = activeOrNext?.ancestorLabels[0] ?? null;
      displayPath = activeOrNext
        ? formatCycleHierarchyLabel(activeOrNext)
        : unitTimings[0]?.cycleLabel ?? null;
      mealType = activeOrNext?.mealType ?? unitTimings[0]?.mealType ?? null;
      const timing = mealType
        ? pickTimingForMeal(unitTimings, ownerIds, mealType)
        : unitTimings[0] ?? null;
      configuredTime = timing?.configuredTime ?? null;
      adjustedTime = timing?.adjustedTime ?? null;
      expectedToday = timing?.expectedToday ?? null;
      mealTargetTime = expectedToday;
      expectationId = timing?.expectationId ?? null;
      adjustedByLabel = timing?.adjustedByLabel ?? null;

      if (includeMealMilestones && mealType) {
        const relatedUnitIds = [unit.id, ...(childIdsByParent.get(unit.id) ?? [])];
        const event =
          events.find(
            (e) => relatedUnitIds.includes(e.unitId) && e.mealType === mealType,
          ) ?? null;
        actualStartedTime = event?.mealServiceStartedAt
          ? localHhMmFromInstant(event.mealServiceStartedAt, timezone)
          : null;
        const mealTargetAt = expectedToday
          ? parseFacilityLocalScheduledStart(expectedToday, now, timezone)
          : null;

        const expectedMilestones = activeOrNext?.expectedMilestones ?? [
          "READY" as const,
          "SERVICE_STARTED" as const,
        ];
        const status = resolveCycleMilestoneStatus({
          event: event
            ? {
                mealType: event.mealType,
                mealServiceReadyAt: event.mealServiceReadyAt,
                mealServiceStartedAt: event.mealServiceStartedAt,
                hasCorrection: event.entries.length > 0,
              }
            : null,
          expectedMilestones,
          mealTargetAt,
          now,
        });
        milestoneStatus = status.key;
        const timingStatus = describeMealServiceTiming({
          configuredTime,
          adjustedTime,
          actualLocalHhMm: actualStartedTime,
        });
        timingStatusLabel = timingStatus.label;
        milestoneLabel =
          timingStatus.key === "not_configured" || timingStatus.key === "not_started"
            ? timingStatus.label
            : cycleMilestoneStatusLabel(status.key);
        exceptionKey =
          timingStatus.key === "not_configured" ? "not_configured" : status.key;

        if (timingStatus.key === "not_configured") {
          counts.missingConfig += 1;
        }

        switch (status.key) {
          case "READY_CONFIRMED":
            counts.readyConfirmed += 1;
            break;
          case "SERVICE_STARTED":
            counts.serviceStarted += 1;
            break;
          case "SERVICE_STARTED_LATE":
            counts.late += 1;
            break;
          case "STARTED_WITHOUT_READY":
            counts.startedWithoutReady += 1;
            break;
          case "NOT_CONFIRMED":
          case "READY_NOT_CONFIRMED":
            counts.notConfirmed += 1;
            break;
          default:
            break;
        }
      }
    }

    rows.push({
      unitId: unit.id,
      unitName: unit.name,
      unitType: unit.unitType,
      cycleState: context.state,
      cycleLabel,
      parentCycleLabel,
      displayPath,
      mealType,
      mealTargetTime,
      configuredTime,
      adjustedTime,
      expectedToday,
      actualStartedTime,
      timingStatusLabel,
      adjustedByLabel,
      expectationId,
      canAdjust: Boolean(canAdjust && expectationId && expectedToday),
      milestoneStatus,
      milestoneLabel,
      exceptionRank: EXCEPTION_RANK[exceptionKey] ?? 100,
      workspaceHref: `/unit/${unit.id}`,
      assignmentBoardHref: `/staffing/assignments?departmentId=${input.departmentId}`,
      builderHref: `/admin/departments/${input.departmentId}?tab=cycles`,
    });
  }
  }

  rows.sort(
    (a, b) =>
      a.exceptionRank - b.exceptionRank ||
      (a.parentCycleLabel ?? "").localeCompare(b.parentCycleLabel ?? "") ||
      a.unitName.localeCompare(b.unitName),
  );

  const nowLocal = localHhMmFromInstant(now, timezone);
  const keyTimeTimings = timingsForPublishedKeyTimeCycles(
    keyTimeMaterialized.timings,
    cycles,
  );
  const groupSummaries = summarizeKeyTimeGroups(keyTimeTimings);
  const byGroupId = new Map<string, KeyTimeDayTiming[]>();
  for (const timing of keyTimeTimings) {
    const key = `${timing.cycleId}:${timing.keyTimeGroupId}:${timing.expectedToday}`;
    const list = byGroupId.get(key) ?? [];
    list.push(timing);
    byGroupId.set(key, list);
  }

  const keyTimeGroups: SupervisorKeyTimeGroupCard[] = groupSummaries.map((summary) => {
    const groupKey = `${summary.cycleId}:${summary.keyTimeGroupId}:${summary.expectedToday}`;
    const rooms = (byGroupId.get(groupKey) ?? []).map((timing) => {
      const status = describeKeyTimeStatus({
        configuredDueLocal: timing.configuredDueLocal,
        adjustedDueLocal: timing.adjustedDueLocal,
        actualDueLocal: timing.actualDueLocal,
        nowLocalHhMm: nowLocal,
      });
      return {
        expectationId: timing.expectationId,
        spaceId: timing.spaceId,
        spaceName: timing.spaceName ?? timing.spaceId,
        facilityRoomTypeName: timing.facilityRoomTypeName ?? null,
        unitName: timing.unitName ?? null,
        configuredDueLocal: timing.configuredDueLocal,
        adjustedDueLocal: timing.adjustedDueLocal,
        expectedToday: timing.expectedToday,
        actualDueLocal: timing.actualDueLocal,
        statusLabel: status.label,
        statusKey: status.key,
        canAdjust: Boolean(canAdjust && !timing.actualDueLocal),
        canComplete: Boolean(
          !timing.actualDueLocal && hasAtLeastRole(input.session.role as AppRole, "STAFF"),
        ),
      };
    });
    rooms.sort((a, b) => a.spaceName.localeCompare(b.spaceName));
    return { ...summary, rooms };
  });

  let keyTimesOverdue = 0;
  for (const timing of keyTimeTimings) {
    if (timing.actualDueLocal) continue;
    const status = describeKeyTimeStatus({
      configuredDueLocal: timing.configuredDueLocal,
      adjustedDueLocal: timing.adjustedDueLocal,
      actualDueLocal: timing.actualDueLocal,
      nowLocalHhMm: nowLocal,
    });
    if (status.key === "overdue") keyTimesOverdue += 1;
  }

  return {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    operationalDateKey,
    rows,
    keyTimeGroups,
    counts: {
      ...counts,
      keyTimesTotal: keyTimeTimings.length,
      keyTimesCompleted: keyTimeTimings.filter((row) => Boolean(row.actualDueLocal)).length,
      keyTimesOverdue,
    },
  };
}
