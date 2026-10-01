/**
 * Forward Dietary timing write.
 * Persists OperationalCycleKeyPointActual only.
 * Does not write ServeryMealServiceEvent, ServeryMilestoneEntry, or meal day expectations.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import type { AppRole } from "@/lib/access";
import type { AuthKind } from "@/lib/auth";
import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { localHhMmFromInstant } from "@/lib/operational-cycles/key-time-day-expectation";
import { hasPlatformCapability } from "@/lib/platform-capability";
import { prisma as defaultPrisma } from "@/lib/prisma";

import {
  dietaryTimingForLegacyControl,
  FOOD_SERVICE_AREA_FUNCTION_KEY,
} from "./meal-timing";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type RecordDietaryMealTimingFailure =
  | "NOT_ALLOWED"
  | "DEPARTMENT_UNAVAILABLE"
  | "KEY_POINT_UNAVAILABLE"
  | "NO_PARTICIPATING_PLACE"
  | "ACTUAL_NOT_TRACKED"
  | "CORRECTION_REASON_REQUIRED"
  | "NOTHING_TO_CORRECT"
  | "ALREADY_RECORDED"
  | "OCCURRENCE_TIME_INVALID";

export type RecordDietaryMealTimingResult =
  | {
      ok: true;
      actualId: string;
      stableKey: string;
      occurredAt: Date;
      recordedAt: Date;
      deduplicated: boolean;
    }
  | { ok: false; reason: RecordDietaryMealTimingFailure };

export async function recordDietaryMealTiming(
  input: {
    facilityId: string;
    unitId: string;
    mealType: string;
    eventType: "READY" | "STARTED";
    action: "RECORD" | "CORRECT";
    occurredAt?: Date | null;
    reason?: string | null;
    serviceDateKey?: string | null;
    actor: {
      userId: string | null;
      employeeId: string | null;
      role: AppRole;
      authKind: AuthKind;
    };
    now?: Date;
  },
  client: DbClient = defaultPrisma,
): Promise<RecordDietaryMealTimingResult> {
  const mapped = dietaryTimingForLegacyControl({
    mealType: input.mealType,
    eventType: input.eventType,
  });
  if (!mapped) return { ok: false, reason: "KEY_POINT_UNAVAILABLE" };

  const capability =
    input.action === "CORRECT" ? "operational_timing.adjust" : "operational_timing.record";
  if (
    !hasPlatformCapability({
      capability,
      role: input.actor.role,
      authKind: input.actor.authKind,
    })
  ) {
    return { ok: false, reason: "NOT_ALLOWED" };
  }

  const now = input.now ?? new Date();
  const occurredAt = input.occurredAt ?? now;
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > now.getTime() + 1000) {
    return { ok: false, reason: "OCCURRENCE_TIME_INVALID" };
  }
  if (input.action === "CORRECT" && !input.reason?.trim()) {
    return { ok: false, reason: "CORRECTION_REASON_REQUIRED" };
  }

  const department = await client.department.findFirst({
    where: { facilityId: input.facilityId, key: "DIETARY", isActive: true },
    select: { id: true },
  });
  if (!department) return { ok: false, reason: "DEPARTMENT_UNAVAILABLE" };

  const timezone = await loadFacilityTimezone(client as PrismaClient, input.facilityId);
  const serviceDate = facilityLocalDateToServiceDate(
    input.serviceDateKey ?? toServiceDateKey(getFacilityServiceDate(timezone, now)),
  );
  const point = await client.departmentOperationalCycle.findFirst({
    where: {
      facilityId: input.facilityId,
      departmentId: department.id,
      stableKey: mapped.stableKey,
      nodeKind: "KEY_TIME",
      status: "PUBLISHED",
      effectiveFrom: { lte: serviceDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: serviceDate } }],
    },
    orderBy: { version: "desc" },
    select: {
      id: true,
      stableKey: true,
      version: true,
      occurrenceTracking: true,
      keyPointGrain: true,
    },
  });
  if (!point) return { ok: false, reason: "KEY_POINT_UNAVAILABLE" };
  if (point.occurrenceTracking === "NONE") {
    return { ok: false, reason: "ACTUAL_NOT_TRACKED" };
  }

  const spaceIds =
    point.keyPointGrain === "DEPARTMENT"
      ? [null]
      : await foodServiceAreaSpaceIds(client, {
          facilityId: input.facilityId,
          departmentId: department.id,
          unitId: input.unitId,
        });
  if (spaceIds.length === 0) return { ok: false, reason: "NO_PARTICIPATING_PLACE" };

  if (input.action === "CORRECT") {
    for (const spaceId of spaceIds) {
      const count = await client.operationalCycleKeyPointActual.count({
        where: {
          facilityId: input.facilityId,
          departmentId: department.id,
          serviceDate,
          cycleStableKey: point.stableKey,
          spaceId,
        },
      });
      if (count === 0) return { ok: false, reason: "NOTHING_TO_CORRECT" };
    }
  }

  const actualLocal = localHhMmFromInstant(occurredAt, timezone);
  const recordedAt = now;
  let firstId: string | null = null;
  let createdAny = false;

  for (const spaceId of spaceIds) {
    const existing = await client.operationalCycleKeyPointActual.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: department.id,
        serviceDate,
        cycleStableKey: point.stableKey,
        spaceId,
      },
      orderBy: { recordedAt: "asc" },
      select: { id: true },
    });
    if (input.action === "RECORD" && existing.length > 0) {
      firstId = firstId ?? existing[existing.length - 1]!.id;
      continue;
    }
    const created = await client.operationalCycleKeyPointActual.create({
      data: {
        facilityId: input.facilityId,
        departmentId: department.id,
        serviceDate,
        cycleId: point.id,
        cycleStableKey: point.stableKey,
        cycleVersion: point.version,
        spaceId,
        actualLocal,
        recordedAt,
        actorUserId: input.actor.userId,
        actorEmployeeId: input.actor.employeeId,
        correctionReason: input.action === "CORRECT" ? input.reason!.trim() : null,
        correctsActualId:
          input.action === "CORRECT" ? existing[existing.length - 1]!.id : null,
      },
      select: { id: true },
    });
    createdAny = true;
    firstId = firstId ?? created.id;
  }

  if (!createdAny) return { ok: false, reason: "ALREADY_RECORDED" };
  if (!firstId) return { ok: false, reason: "KEY_POINT_UNAVAILABLE" };
  return {
    ok: true,
    actualId: firstId,
    stableKey: point.stableKey,
    occurredAt,
    recordedAt,
    deduplicated: false,
  };
}

async function foodServiceAreaSpaceIds(
  client: DbClient,
  input: { facilityId: string; departmentId: string; unitId: string },
): Promise<string[]> {
  const bindings = await client.departmentRoomArchetypeBinding.findMany({
    where: {
      profile: { departmentId: input.departmentId },
      archetype: { key: FOOD_SERVICE_AREA_FUNCTION_KEY, isActive: true },
      unitSpace: {
        facilityId: input.facilityId,
        isActive: true,
        OR: [{ unitId: input.unitId }, { unit: { parentUnitId: input.unitId } }],
      },
    },
    select: { unitSpaceId: true },
  });
  return [...new Set(bindings.map((row) => row.unitSpaceId))];
}
