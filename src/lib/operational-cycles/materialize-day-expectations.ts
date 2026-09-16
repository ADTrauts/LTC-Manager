/**
 * Persist today's meal-service timing expectations from the governing published cycle version.
 * Idempotent. Never overwrites configuredTime or adjustedTime on existing rows.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { loadScopeLocations } from "./cycle-service";
import {
  expectedTodayTime,
  timingKey,
  type DayMealTiming,
} from "./day-expectation";
import { loadPublishedCyclesForDate } from "./load-published-cycles";
import { planMealServiceDayExpectations } from "./plan-day-expectations";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type MaterializeDayExpectationsInput = {
  facilityId: string;
  departmentId: string;
  /** YYYY-MM-DD facility service date. Defaults to today in facility TZ. */
  operationalDateKey?: string;
  now?: Date;
  /**
   * When false, only load existing rows — never create. Use for historical days
   * that were never materialized (legacy UnitMealTime era).
   */
  createIfMissing?: boolean;
};

export type MaterializeDayExpectationsResult = {
  operationalDateKey: string;
  created: number;
  timings: DayMealTiming[];
};

function mapTiming(row: {
  id: string;
  unitId: string;
  mealType: string;
  cycleId: string;
  cycleStableKey: string;
  cycleVersion: number;
  cycleLabel: string;
  milestone: string;
  configuredTime: string | null;
  adjustedTime: string | null;
  adjustedAt: Date | null;
  adjustedByUser?: { displayName: string } | null;
  adjustedByEmployee?: { firstName: string; lastName: string } | null;
}): DayMealTiming {
  const adjustedByLabel = row.adjustedByUser?.displayName
    ?? (row.adjustedByEmployee
      ? `${row.adjustedByEmployee.firstName} ${row.adjustedByEmployee.lastName}`.trim()
      : null);
  return {
    expectationId: row.id,
    unitId: row.unitId,
    mealType: row.mealType,
    cycleId: row.cycleId,
    cycleStableKey: row.cycleStableKey,
    cycleVersion: row.cycleVersion,
    cycleLabel: row.cycleLabel,
    milestone: row.milestone,
    configuredTime: row.configuredTime,
    adjustedTime: row.adjustedTime,
    expectedToday: expectedTodayTime(row),
    adjustedAt: row.adjustedAt,
    adjustedByLabel,
  };
}

async function loadExistingTimings(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    serviceDate: Date;
  },
): Promise<DayMealTiming[]> {
  const rows = await client.operationalCycleDayExpectation.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate: input.serviceDate,
      milestone: "SERVICE_STARTED",
    },
    include: {
      adjustedByUser: { select: { displayName: true } },
      adjustedByEmployee: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ mealType: "asc" }, { unitId: "asc" }],
  });
  return rows.map(mapTiming);
}

/**
 * Materialize meal-service day expectations for one department + operational date.
 * Today's first Run load creates the frozen snapshot. Re-runs are no-ops for existing cycles.
 * Historical dates load existing rows only unless createIfMissing is explicitly true.
 */
export async function materializeMealServiceDayExpectations(
  input: MaterializeDayExpectationsInput,
  client: DbClient = prisma,
): Promise<MaterializeDayExpectationsResult> {
  const timezone = await loadFacilityTimezone(client as PrismaClient, input.facilityId);
  const now = input.now ?? new Date();
  const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const operationalDateKey = input.operationalDateKey ?? todayKey;
  const createIfMissing = input.createIfMissing ?? operationalDateKey === todayKey;
  const serviceDate = facilityLocalDateToServiceDate(operationalDateKey);

  const existing = await loadExistingTimings(client, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    serviceDate,
  });

  if (!createIfMissing) {
    return { operationalDateKey, created: 0, timings: existing };
  }

  const [cycles, locations] = await Promise.all([
    loadPublishedCyclesForDate(
      input.facilityId,
      input.departmentId,
      operationalDateKey,
      client,
    ),
    loadScopeLocations(client, input.facilityId, input.departmentId),
  ]);

  const planned = planMealServiceDayExpectations({
    cycles,
    locations,
    existing: existing.map((row) => ({
      cycleId: row.cycleId,
      cycleStableKey: row.cycleStableKey,
      unitId: row.unitId,
      milestone: row.milestone,
    })),
  });

  if (planned.length === 0) {
    return { operationalDateKey, created: 0, timings: existing };
  }

  await client.operationalCycleDayExpectation.createMany({
    data: planned.map((row) => ({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate,
      cycleId: row.cycleId,
      cycleStableKey: row.cycleStableKey,
      cycleVersion: row.cycleVersion,
      cycleLabel: row.cycleLabel,
      mealType: row.mealType,
      unitId: row.unitId,
      milestone: row.milestone,
      configuredTime: row.configuredTime,
    })),
    skipDuplicates: true,
  });

  const timings = await loadExistingTimings(client, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    serviceDate,
  });

  return {
    operationalDateKey,
    created: Math.max(0, timings.length - existing.length),
    timings,
  };
}

export function indexTimingsByUnitMeal(
  timings: readonly DayMealTiming[],
): Map<string, DayMealTiming> {
  const map = new Map<string, DayMealTiming>();
  for (const row of timings) {
    map.set(timingKey(row.unitId, row.mealType), row);
  }
  return map;
}

export function mealTargetsFromTimings(
  timings: readonly DayMealTiming[],
  ownerUnitIds: readonly string[],
): Array<{ mealType: DayMealTiming["mealType"]; scheduledTime: string }> {
  const owners = new Set(ownerUnitIds);
  const out: Array<{ mealType: string; scheduledTime: string }> = [];
  for (const row of timings) {
    if (!owners.has(row.unitId)) continue;
    if (!row.expectedToday) continue;
    out.push({ mealType: row.mealType, scheduledTime: row.expectedToday });
  }
  return out;
}

export function timingsForOwnerUnits(
  timings: readonly DayMealTiming[],
  ownerUnitIds: readonly string[],
): DayMealTiming[] {
  const owners = new Set(ownerUnitIds);
  return timings.filter((row) => owners.has(row.unitId));
}

export function configuredMealTypesFromTimings(
  timings: readonly DayMealTiming[],
  ownerUnitIds: readonly string[],
): string[] {
  return [...new Set(timingsForOwnerUnits(timings, ownerUnitIds).map((row) => row.mealType))];
}
