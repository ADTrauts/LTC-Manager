/**
 * Persist today's Key Time Runtime expectations from governing published KEY_TIME versions.
 * Idempotent. Never overwrites configured/adjusted/actual on existing rows.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import {
  expectedKeyTimeToday,
  type KeyTimeDayTiming,
} from "./key-time-day-expectation";
import { loadPublishedCyclesWithKeyTimesForDate } from "./load-published-cycles";
import { planKeyTimeDayExpectations } from "./plan-key-time-day-expectations";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type MaterializeKeyTimeDayExpectationsInput = {
  facilityId: string;
  departmentId: string;
  operationalDateKey?: string;
  now?: Date;
  createIfMissing?: boolean;
};

export type MaterializeKeyTimeDayExpectationsResult = {
  operationalDateKey: string;
  created: number;
  timings: KeyTimeDayTiming[];
};

function actorLabel(row: {
  adjustedByUser?: { displayName: string } | null;
  adjustedByEmployee?: { firstName: string; lastName: string } | null;
  completedByUser?: { displayName: string } | null;
  completedByEmployee?: { firstName: string; lastName: string } | null;
}): { adjustedByLabel: string | null; completedByLabel: string | null } {
  const adjustedByLabel =
    row.adjustedByUser?.displayName ??
    (row.adjustedByEmployee
      ? `${row.adjustedByEmployee.firstName} ${row.adjustedByEmployee.lastName}`.trim()
      : null);
  const completedByLabel =
    row.completedByUser?.displayName ??
    (row.completedByEmployee
      ? `${row.completedByEmployee.firstName} ${row.completedByEmployee.lastName}`.trim()
      : null);
  return { adjustedByLabel, completedByLabel };
}

function mapTiming(row: {
  id: string;
  spaceId: string;
  cycleId: string;
  cycleStableKey: string;
  cycleVersion: number;
  cycleLabel: string;
  parentCycleLabel: string | null;
  displayPath: string;
  keyTimeGroupId: string;
  configuredDueLocal: string;
  adjustedDueLocal: string | null;
  actualDueLocal: string | null;
  completedAt: Date | null;
  adjustedAt: Date | null;
  space?: {
    name: string;
    unitId: string | null;
    unit?: { name: string } | null;
    facilityRoomType?: { displayName: string } | null;
  } | null;
  adjustedByUser?: { displayName: string } | null;
  adjustedByEmployee?: { firstName: string; lastName: string } | null;
  completedByUser?: { displayName: string } | null;
  completedByEmployee?: { firstName: string; lastName: string } | null;
}): KeyTimeDayTiming {
  const labels = actorLabel(row);
  return {
    expectationId: row.id,
    spaceId: row.spaceId,
    spaceName: row.space?.name ?? null,
    facilityRoomTypeName: row.space?.facilityRoomType?.displayName ?? null,
    unitId: row.space?.unitId ?? null,
    unitName: row.space?.unit?.name ?? null,
    cycleId: row.cycleId,
    cycleStableKey: row.cycleStableKey,
    cycleVersion: row.cycleVersion,
    cycleLabel: row.cycleLabel,
    parentCycleLabel: row.parentCycleLabel,
    displayPath: row.displayPath,
    keyTimeGroupId: row.keyTimeGroupId,
    configuredDueLocal: row.configuredDueLocal,
    adjustedDueLocal: row.adjustedDueLocal,
    expectedToday: expectedKeyTimeToday(row) ?? row.configuredDueLocal,
    actualDueLocal: row.actualDueLocal,
    completedAt: row.completedAt,
    adjustedAt: row.adjustedAt,
    adjustedByLabel: labels.adjustedByLabel,
    completedByLabel: labels.completedByLabel,
  };
}

async function loadExistingTimings(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    serviceDate: Date;
  },
): Promise<KeyTimeDayTiming[]> {
  const rows = await client.operationalCycleKeyTimeDayExpectation.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate: input.serviceDate,
    },
    include: {
      space: {
        select: {
          name: true,
          unitId: true,
          unit: { select: { name: true } },
          facilityRoomType: { select: { displayName: true } },
        },
      },
      adjustedByUser: { select: { displayName: true } },
      adjustedByEmployee: { select: { firstName: true, lastName: true } },
      completedByUser: { select: { displayName: true } },
      completedByEmployee: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ configuredDueLocal: "asc" }, { cycleLabel: "asc" }, { spaceId: "asc" }],
  });
  return rows.map(mapTiming);
}

/**
 * Materialize Key Time day expectations for one department + operational date.
 * Today's first Run load freezes the snapshot. Re-runs skip existing rows.
 * Historical dates load existing rows only unless createIfMissing is true.
 */
export async function materializeKeyTimeDayExpectations(
  input: MaterializeKeyTimeDayExpectationsInput,
  client: DbClient = prisma,
): Promise<MaterializeKeyTimeDayExpectationsResult> {
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

  const cycles = await loadPublishedCyclesWithKeyTimesForDate(
    input.facilityId,
    input.departmentId,
    operationalDateKey,
    client,
  );

  const planned = planKeyTimeDayExpectations({
    cycles,
    existing: existing.map((row) => ({
      cycleId: row.cycleId,
      spaceId: row.spaceId,
    })),
  });

  if (planned.length === 0) {
    return { operationalDateKey, created: 0, timings: existing };
  }

  await client.operationalCycleKeyTimeDayExpectation.createMany({
    data: planned.map((row) => ({
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate,
      cycleId: row.cycleId,
      cycleStableKey: row.cycleStableKey,
      cycleVersion: row.cycleVersion,
      cycleLabel: row.cycleLabel,
      parentCycleLabel: row.parentCycleLabel,
      displayPath: row.displayPath,
      keyTimeGroupId: row.keyTimeGroupId,
      spaceId: row.spaceId,
      configuredDueLocal: row.configuredDueLocal,
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

export function timingsForSpaces(
  timings: readonly KeyTimeDayTiming[],
  spaceIds: readonly string[],
): KeyTimeDayTiming[] {
  const set = new Set(spaceIds);
  return timings.filter((row) => set.has(row.spaceId));
}

export function timingsForOwnerUnits(
  timings: readonly KeyTimeDayTiming[],
  ownerUnitIds: readonly string[],
): KeyTimeDayTiming[] {
  const owners = new Set(ownerUnitIds);
  return timings.filter((row) => row.unitId && owners.has(row.unitId));
}
