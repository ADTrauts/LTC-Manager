/**
 * Today's Key Time expected-time adjustment + completion.
 * Mutates Runtime expectation only — never Build Key Time groups.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import type { FacilitySession } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { loadFacilityTimezone } from "@/lib/operational-time";
import { hasPlatformCapability } from "@/lib/platform-capability";
import { prisma } from "@/lib/prisma";

import {
  addMinutesToLocalTime,
  expectedKeyTimeToday,
  localHhMmFromInstant,
} from "./key-time-day-expectation";
import { keyPointActualAppendDecision } from "./cycle-canonical";
import {
  decideAdjustDayExpectationAuthority,
  type AdjustDayExpectationDenial,
} from "./adjust-day-expectation";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type AdjustKeyTimeDayExpectationInput = {
  session: FacilitySession;
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
  | "CORRECTION_FORBIDDEN"
  | "CORRECTION_REASON_REQUIRED";

export type CompleteKeyTimeDayExpectationInput = {
  session: FacilitySession;
  expectationId: string;
  /** Optional absolute actual time (HH:mm). Defaults to now in facility TZ. */
  actualDueLocal?: string;
  /** When an actual already exists, record an append-only correction. */
  allowCorrection?: boolean;
  correctionReason?: string | null;
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
  /** Platform capability operational_timing.adjust. Corrections do not name a job title. */
  canAdjustTiming?: boolean;
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
  if (input.alreadyCompleted && input.allowCorrection && !input.canAdjustTiming) {
    return { allowed: false, reason: "CORRECTION_FORBIDDEN" };
  }
  return { allowed: true };
}

/**
 * Appends OperationalCycleKeyPointActual. The expectation actualDueLocal update is
 * compatibility presentation for the older screen. Occurrence is the actual row.
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
      serviceDate: true,
      cycleId: true,
      cycleStableKey: true,
      cycleVersion: true,
      spaceId: true,
    },
  });
  if (!row) return { ok: false, reason: "NOT_FOUND" };

  const existingActuals = await client.operationalCycleKeyPointActual.findMany({
    where: { cycleId: row.cycleId, serviceDate: row.serviceDate, spaceId: row.spaceId },
    orderBy: { recordedAt: "asc" },
    select: { id: true },
  });
  const allowCorrection = Boolean(input.allowCorrection);
  const alreadyCompleted = existingActuals.length > 0;
  const canAdjustTiming = hasPlatformCapability({
    capability: "operational_timing.adjust",
    role: input.session.role as AppRole,
    authKind: input.session.authKind,
  });
  const decision = decideCompleteKeyTimeAuthority({
    sessionFacilityId: input.session.facilityId,
    expectationFacilityId: row.facilityId,
    role: input.session.role as AppRole,
    alreadyCompleted,
    allowCorrection,
    canAdjustTiming,
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

  const append = keyPointActualAppendDecision({
    existingCount: existingActuals.length,
    correctionReason: input.correctionReason,
  });
  if (append === "already_recorded") {
    return {
      ok: false,
      reason: allowCorrection ? "CORRECTION_REASON_REQUIRED" : "ALREADY_COMPLETED",
    };
  }
  const prior = existingActuals[existingActuals.length - 1] ?? null;

  await client.operationalCycleKeyPointActual.create({
    data: {
      facilityId: row.facilityId,
      departmentId: row.departmentId,
      serviceDate: row.serviceDate,
      cycleId: row.cycleId,
      cycleStableKey: row.cycleStableKey,
      cycleVersion: row.cycleVersion,
      spaceId: row.spaceId,
      actualLocal: actual,
      recordedAt: now,
      actorUserId: sessionUserIdForFk(input.session),
      actorEmployeeId: input.session.authKind === "employee" ? input.session.uid : null,
      correctionReason: append === "correct" ? input.correctionReason!.trim() : null,
      correctsActualId: append === "correct" ? prior?.id ?? null : null,
    },
  });

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
