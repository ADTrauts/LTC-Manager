/**
 * Today's Key Time expected-time adjustment + completion.
 * Mutates Runtime expectation only — never Build Key Time groups.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { loadFacilityTimezone } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import {
  addMinutesToLocalTime,
  expectedKeyTimeToday,
  localHhMmFromInstant,
} from "./key-time-day-expectation";
import {
  decideAdjustDayExpectationAuthority,
  type AdjustDayExpectationDenial,
} from "./adjust-day-expectation";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type AdjustKeyTimeDayExpectationInput = {
  session: AppJwtPayload;
  expectationId: string;
  addMinutes?: number;
  adjustedDueLocal?: string;
  reason?: string | null;
};

export type AdjustKeyTimeDayExpectationResult =
  | {
      ok: true;
      expectationId: string;
      configuredDueLocal: string;
      adjustedDueLocal: string;
      expectedToday: string;
    }
  | { ok: false; reason: AdjustDayExpectationDenial };

/**
 * Supervisor+ may +N today's Key Time expected due time. Build remains unchanged.
 */
export async function adjustKeyTimeDayExpectation(
  input: AdjustKeyTimeDayExpectationInput,
  client: DbClient = prisma,
): Promise<AdjustKeyTimeDayExpectationResult> {
  const row = await client.operationalCycleKeyTimeDayExpectation.findFirst({
    where: { id: input.expectationId },
    select: {
      id: true,
      facilityId: true,
      departmentId: true,
      configuredDueLocal: true,
      adjustedDueLocal: true,
    },
  });
  if (!row) return { ok: false, reason: "NOT_FOUND" };

  const decision = decideAdjustDayExpectationAuthority({
    sessionFacilityId: input.session.facilityId,
    expectationFacilityId: row.facilityId,
    role: input.session.role as AppRole,
    authKind: input.session.authKind,
  });
  if (!decision.allowed) return { ok: false, reason: decision.reason };

  let nextAdjusted: string | null = null;
  if (typeof input.addMinutes === "number") {
    if (!Number.isFinite(input.addMinutes) || input.addMinutes === 0) {
      return { ok: false, reason: "INVALID_MINUTES" };
    }
    const baseline = expectedKeyTimeToday(row);
    if (!baseline) return { ok: false, reason: "NOT_CONFIGURED" };
    nextAdjusted = addMinutesToLocalTime(baseline, input.addMinutes);
  } else if (input.adjustedDueLocal) {
    nextAdjusted = addMinutesToLocalTime(input.adjustedDueLocal, 0);
  }

  if (!nextAdjusted) return { ok: false, reason: "INVALID_TIME" };

  const updated = await client.operationalCycleKeyTimeDayExpectation.update({
    where: { id: row.id },
    data: {
      adjustedDueLocal: nextAdjusted,
      adjustmentReason: input.reason?.trim() || null,
      adjustedAt: new Date(),
      adjustedByUserId: sessionUserIdForFk(input.session),
      adjustedByEmployeeId:
        input.session.authKind === "employee" ? input.session.uid : null,
    },
    select: {
      id: true,
      configuredDueLocal: true,
      adjustedDueLocal: true,
    },
  });

  return {
    ok: true,
    expectationId: updated.id,
    configuredDueLocal: updated.configuredDueLocal,
    adjustedDueLocal: updated.adjustedDueLocal!,
    expectedToday: expectedKeyTimeToday(updated)!,
  };
}

export type CompleteKeyTimeDayExpectationDenial =
  | AdjustDayExpectationDenial
  | "ALREADY_COMPLETED"
  | "CORRECTION_FORBIDDEN";

export type CompleteKeyTimeDayExpectationInput = {
  session: AppJwtPayload;
  expectationId: string;
  /** Optional absolute actual time (HH:mm). Defaults to now in facility TZ. */
  actualDueLocal?: string;
  /** Supervisor+ may overwrite an existing actual. */
  allowCorrection?: boolean;
  now?: Date;
};

export type CompleteKeyTimeDayExpectationResult =
  | {
      ok: true;
      expectationId: string;
      configuredDueLocal: string;
      adjustedDueLocal: string | null;
      expectedToday: string;
      actualDueLocal: string;
    }
  | { ok: false; reason: CompleteKeyTimeDayExpectationDenial };

export function decideCompleteKeyTimeAuthority(input: {
  sessionFacilityId: string;
  expectationFacilityId: string;
  role: AppRole;
  alreadyCompleted: boolean;
  allowCorrection: boolean;
}): { allowed: true } | { allowed: false; reason: CompleteKeyTimeDayExpectationDenial } {
  if (input.sessionFacilityId !== input.expectationFacilityId) {
    return { allowed: false, reason: "CROSS_FACILITY" };
  }
  if (!hasAtLeastRole(input.role, "STAFF")) {
    return { allowed: false, reason: "ROLE_REQUIRED" };
  }
  if (input.alreadyCompleted && !input.allowCorrection) {
    return { allowed: false, reason: "ALREADY_COMPLETED" };
  }
  if (input.alreadyCompleted && input.allowCorrection && !hasAtLeastRole(input.role, "SUPERVISOR")) {
    return { allowed: false, reason: "CORRECTION_FORBIDDEN" };
  }
  return { allowed: true };
}

/**
 * Mark a Key Time complete for a Room. Employees may complete once;
 * Supervisor+ may correct. Does not write ServeryMealServiceEvent.
 * Same-facility + role is enough — published Key Time rows are Run
 * records even when DIETARY_OPERATIONAL_CYCLES_ENABLED is off.
 */
export async function completeKeyTimeDayExpectation(
  input: CompleteKeyTimeDayExpectationInput,
  client: DbClient = prisma,
): Promise<CompleteKeyTimeDayExpectationResult> {
  const row = await client.operationalCycleKeyTimeDayExpectation.findFirst({
    where: { id: input.expectationId },
    select: {
      id: true,
      facilityId: true,
      departmentId: true,
      configuredDueLocal: true,
      adjustedDueLocal: true,
      actualDueLocal: true,
      completedAt: true,
    },
  });
  if (!row) return { ok: false, reason: "NOT_FOUND" };

  const allowCorrection = Boolean(input.allowCorrection);
  const decision = decideCompleteKeyTimeAuthority({
    sessionFacilityId: input.session.facilityId,
    expectationFacilityId: row.facilityId,
    role: input.session.role as AppRole,
    alreadyCompleted: Boolean(row.actualDueLocal || row.completedAt),
    allowCorrection,
  });
  if (!decision.allowed) return { ok: false, reason: decision.reason };

  const now = input.now ?? new Date();
  let actual = input.actualDueLocal
    ? addMinutesToLocalTime(input.actualDueLocal, 0)
    : null;
  if (!actual) {
    const timezone = await loadFacilityTimezone(client as PrismaClient, row.facilityId);
    actual = localHhMmFromInstant(now, timezone);
  }
  if (!actual) return { ok: false, reason: "INVALID_TIME" };

  const updated = await client.operationalCycleKeyTimeDayExpectation.update({
    where: { id: row.id },
    data: {
      actualDueLocal: actual,
      completedAt: now,
      completedByUserId: sessionUserIdForFk(input.session),
      completedByEmployeeId:
        input.session.authKind === "employee" ? input.session.uid : null,
    },
    select: {
      id: true,
      configuredDueLocal: true,
      adjustedDueLocal: true,
      actualDueLocal: true,
    },
  });

  return {
    ok: true,
    expectationId: updated.id,
    configuredDueLocal: updated.configuredDueLocal,
    adjustedDueLocal: updated.adjustedDueLocal,
    expectedToday: expectedKeyTimeToday(updated)!,
    actualDueLocal: updated.actualDueLocal!,
  };
}
