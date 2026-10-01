/**
 * Routes one Ready or Service Started command to exactly one writer.
 * The published Cycle set effective on the service date chooses the writer.
 * Canonical and legacy stores are never both written.
 */

import type { MealType, Prisma, PrismaClient } from "@prisma/client";

import type { AppRole } from "@/lib/access";
import type { AuthKind } from "@/lib/auth";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { loadPublishedCyclesWithKeyTimesForDate } from "@/lib/operational-cycles/load-published-cycles";
import { recordServeryMilestone } from "@/lib/servery/record-milestone";
import { prisma as defaultPrisma } from "@/lib/prisma";

import {
  dietaryTimingWriteTarget,
  selectDietaryMealTimingModel,
  type DietaryMealTimingModel,
} from "./meal-timing";
import {
  recordDietaryMealTiming,
  type RecordDietaryMealTimingResult,
} from "./record-meal-timing";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type RouteDietaryMealTimingResult =
  | (Extract<RecordDietaryMealTimingResult, { ok: true }> & {
      model: "CANONICAL_KEY_POINTS" | "LEGACY_MILESTONES";
    })
  | {
      ok: false;
      model: DietaryMealTimingModel;
      reason: string;
    };

export async function routeDietaryMealTiming(
  input: {
    facilityId: string;
    departmentId?: string | null;
    unitId: string;
    mealType: string;
    eventType: "READY" | "STARTED";
    action: "RECORD" | "CORRECT";
    clientActionId: string;
    occurredAt?: Date | null;
    reason?: string | null;
    serviceDateKey?: string | null;
    actor: {
      userId: string | null;
      employeeId: string | null;
      role: AppRole;
      authKind: AuthKind;
      authMethod?: "PASSWORD" | "QUICK_PIN";
      deviceBoundUnitId?: string | null;
    };
    now?: Date;
  },
  client: DbClient = defaultPrisma,
): Promise<RouteDietaryMealTimingResult> {
  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(client as PrismaClient, input.facilityId);
  const serviceDateKey =
    input.serviceDateKey ?? toServiceDateKey(getFacilityServiceDate(timezone, now));
  const department =
    input.departmentId != null
      ? { id: input.departmentId }
      : await client.department.findFirst({
          where: { facilityId: input.facilityId, key: "DIETARY", isActive: true },
          select: { id: true },
        });
  if (!department) {
    return { ok: false, model: "NOT_CONFIGURED", reason: "DEPARTMENT_UNAVAILABLE" };
  }

  const effectiveCycles = await loadPublishedCyclesWithKeyTimesForDate(
    input.facilityId,
    department.id,
    serviceDateKey,
    client,
  );
  const model = selectDietaryMealTimingModel({
    mealType: input.mealType,
    eventType: input.eventType,
    effectiveCycles,
  });
  const target = dietaryTimingWriteTarget(model);

  if (target === "canonical") {
    const result = await recordDietaryMealTiming(
      {
        facilityId: input.facilityId,
        unitId: input.unitId,
        mealType: input.mealType,
        eventType: input.eventType,
        action: input.action,
        occurredAt: input.occurredAt,
        reason: input.reason,
        serviceDateKey,
        actor: input.actor,
        now,
      },
      client,
    );
    if (!result.ok) return { ...result, model };
    return { ...result, model: "CANONICAL_KEY_POINTS" };
  }

  if (target === "legacy") {
    const legacy = await recordServeryMilestone(
      {
        facilityId: input.facilityId,
        unitId: input.unitId,
        mealType: input.mealType as MealType,
        milestone: input.eventType === "READY" ? "READY" : "SERVICE_STARTED",
        action: input.action,
        clientActionId: input.clientActionId,
        occurredAt: input.occurredAt,
        reason: input.reason,
        actor: {
          userId: input.actor.userId,
          employeeId: input.actor.employeeId,
          role: input.actor.role,
          authMethod: input.actor.authMethod ?? "PASSWORD",
        },
        deviceBoundUnitId: input.actor.deviceBoundUnitId,
        now,
      },
      client as PrismaClient,
    );
    if (!legacy.ok) return { ok: false, model, reason: legacy.reason };
    return {
      ok: true,
      model: "LEGACY_MILESTONES",
      actualId: legacy.eventId,
      stableKey: input.mealType,
      occurredAt: legacy.occurredAt,
      recordedAt: legacy.recordedAt,
      deduplicated: legacy.deduplicated,
    };
  }

  return { ok: false, model: "NOT_CONFIGURED", reason: "NOT_CONFIGURED" };
}
