import type { MealType } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { hasAtLeastRole, type AppRole } from "@/lib/access";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { resolveCycleAuthority } from "./cycle-authority";
import { roomTypeKeyForStoredSpace } from "./cycle-scope";
import {
  describeKeyTimeStatus,
  localHhMmFromInstant,
  type KeyTimeDayTiming,
  type KeyTimeStatus,
} from "./key-time-day-expectation";
import { loadPublishedCyclesWithKeyTimesForDate } from "./load-published-cycles";
import {
  materializeMealServiceDayExpectations,
  mealTargetsFromTimings,
  timingsForOwnerUnits,
} from "./materialize-day-expectations";
import {
  materializeKeyTimeDayExpectations,
  timingsForOwnerUnits as keyTimeTimingsForOwnerUnits,
  timingsForSpaces,
} from "./materialize-key-time-day-expectations";
import { timingOwnerUnitIds } from "./plan-day-expectations";
import {
  detectRunModelProvenance,
  timingsForPublishedKeyTimeCycles,
} from "./present-run-operation";
import {
  describeOperationalCycleContext,
  resolveOperationalCycle,
} from "./resolve-operational-cycle";
import type { OperationalCycleContext, UnitMealTarget } from "./types";

export type EmployeeKeyTimeCard = KeyTimeDayTiming & {
  status: KeyTimeStatus;
  canAdjust: boolean;
  canComplete: boolean;
};

export type EmployeeCycleContextCard = {
  facilityId: string;
  departmentId: string;
  unitId: string | null;
  operationalDateKey: string;
  context: OperationalCycleContext;
  description: string;
  mealTargets: UnitMealTarget[];
  /** Generic Key Time expectations for rooms under this unit (or empty). */
  keyTimes: EmployeeKeyTimeCard[];
};

/**
 * Read-only operational cycle card for employee / unit runtime.
 * Draft cycles are never visible. Expected today comes from day expectations.
 * Key Times use the generic Runtime path when published KEY_TIME nodes exist.
 */
export async function loadEmployeeCycleContext(input: {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  unitId?: string | null;
  spaceId?: string | null;
  now?: Date;
}): Promise<EmployeeCycleContextCard | null> {
  const authority = await resolveCycleAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewRuntime) {
    return null;
  }

  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const nowLocal = localHhMmFromInstant(now, timezone);
  const role = input.session.role as AppRole;
  const canAdjust = hasAtLeastRole(role, "SUPERVISOR");
  const canComplete = hasAtLeastRole(role, "STAFF");

  const [cycles, mealMaterialized, keyTimeMaterialized] = await Promise.all([
    loadPublishedCyclesWithKeyTimesForDate(
      input.facilityId,
      input.departmentId,
      operationalDateKey,
    ),
    materializeMealServiceDayExpectations({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      operationalDateKey,
      now,
    }),
    materializeKeyTimeDayExpectations({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      operationalDateKey,
      now,
    }),
  ]);

  let unit: {
    id: string;
    unitType: import("@prisma/client").UnitType;
    parentUnitId: string | null;
    childRoomTypeKeys?: string[];
    spaceIds?: string[];
  } | null = null;
  let mealTargets: UnitMealTarget[] = [];
  let keyTimes: EmployeeKeyTimeCard[] = [];

  if (input.unitId) {
    const row = await prisma.unit.findFirst({
      where: {
        id: input.unitId,
        facilityId: input.facilityId,
        isActive: true,
      },
      select: {
        id: true,
        unitType: true,
        parentUnitId: true,
        mealTimes: {
          where: { isActive: true },
          select: { mealType: true, scheduledTime: true },
        },
        childSpaces: {
          select: {
            id: true,
            spaceType: true,
            customTypeLabel: true,
            facilityRoomType: { select: { displayName: true } },
          },
        },
      },
    });
    if (!row) return null;
    unit = {
      id: row.id,
      unitType: row.unitType,
      parentUnitId: row.parentUnitId,
      childRoomTypeKeys: [
        ...new Set(row.childSpaces.map((space) => roomTypeKeyForStoredSpace(space))),
      ],
      spaceIds: row.childSpaces.map((space) => space.id),
    };
    const ownerIds = timingOwnerUnitIds(unit);
    const unitTimings = timingsForOwnerUnits(mealMaterialized.timings, ownerIds);
    if (unitTimings.length > 0) {
      mealTargets = mealTargetsFromTimings(unitTimings, ownerIds).map((target) => ({
        mealType: target.mealType as MealType,
        scheduledTime: target.scheduledTime,
      }));
    } else {
      mealTargets = row.mealTimes.map((m) => ({
        mealType: m.mealType,
        scheduledTime: m.scheduledTime,
      }));
    }

    const publishedKeyTimes = timingsForPublishedKeyTimeCycles(
      keyTimeMaterialized.timings,
      cycles,
    );
    const spaceScoped = input.spaceId
      ? timingsForSpaces(publishedKeyTimes, [input.spaceId])
      : keyTimeTimingsForOwnerUnits(publishedKeyTimes, ownerIds);
    keyTimes = spaceScoped.map((timing) => ({
      ...timing,
      status: describeKeyTimeStatus({
        configuredDueLocal: timing.configuredDueLocal,
        adjustedDueLocal: timing.adjustedDueLocal,
        actualDueLocal: timing.actualDueLocal,
        nowLocalHhMm: nowLocal,
      }),
      canAdjust: canAdjust && !timing.actualDueLocal,
      canComplete: canComplete && !timing.actualDueLocal,
    }));
  } else if (input.spaceId) {
    const publishedKeyTimes = timingsForPublishedKeyTimeCycles(
      keyTimeMaterialized.timings,
      cycles,
    );
    const spaceTimings = timingsForSpaces(publishedKeyTimes, [input.spaceId]);
    keyTimes = spaceTimings.map((timing) => ({
      ...timing,
      status: describeKeyTimeStatus({
        configuredDueLocal: timing.configuredDueLocal,
        adjustedDueLocal: timing.adjustedDueLocal,
        actualDueLocal: timing.actualDueLocal,
        nowLocalHhMm: nowLocal,
      }),
      canAdjust: canAdjust && !timing.actualDueLocal,
      canComplete: canComplete && !timing.actualDueLocal,
    }));
  }

  const provenance = detectRunModelProvenance(cycles, keyTimeMaterialized.timings);
  if (provenance === "NEW_PERIOD_KEY_TIME") {
    mealTargets = [];
  }

  const context = resolveOperationalCycle({
    cycles,
    now,
    facilityTimezone: timezone,
    operationalDateKey,
    unit,
    spaceId: input.spaceId,
    mealTargets,
  });

  return {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    unitId: unit?.id ?? null,
    operationalDateKey,
    context,
    description: describeOperationalCycleContext(context),
    mealTargets,
    keyTimes,
  };
}
