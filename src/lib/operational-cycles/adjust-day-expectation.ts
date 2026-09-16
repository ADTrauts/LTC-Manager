/**
 * Today's meal-service expected-time adjustment. Mutates runtime expectation only — never Build.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { addMinutesToLocalTime, expectedTodayTime } from "./day-expectation";
import { resolveCycleAuthority } from "./cycle-authority";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type AdjustDayExpectationDenial =
  | "NOT_FOUND"
  | "CROSS_FACILITY"
  | "ROLE_REQUIRED"
  | "EMPLOYEE_FORBIDDEN"
  | "NOT_CONFIGURED"
  | "INVALID_MINUTES"
  | "INVALID_TIME";

export function decideAdjustDayExpectationAuthority(input: {
  sessionFacilityId: string;
  expectationFacilityId: string;
  role: AppRole;
  authKind: "user" | "employee";
}): { allowed: true } | { allowed: false; reason: AdjustDayExpectationDenial } {
  if (input.sessionFacilityId !== input.expectationFacilityId) {
    return { allowed: false, reason: "CROSS_FACILITY" };
  }
  if (input.authKind === "employee" && !hasAtLeastRole(input.role, "SUPERVISOR")) {
    return { allowed: false, reason: "EMPLOYEE_FORBIDDEN" };
  }
  if (!hasAtLeastRole(input.role, "SUPERVISOR")) {
    return { allowed: false, reason: "ROLE_REQUIRED" };
  }
  return { allowed: true };
}

export type AdjustDayExpectationInput = {
  session: AppJwtPayload;
  expectationId: string;
  /** Incremental delay in minutes. Preferred quick action is +5. */
  addMinutes?: number;
  /** Absolute replacement for adjustedTime (HH:MM). */
  adjustedTime?: string;
  reason?: string | null;
};

export type AdjustDayExpectationResult =
  | {
      ok: true;
      expectationId: string;
      configuredTime: string | null;
      adjustedTime: string;
      expectedToday: string;
    }
  | { ok: false; reason: AdjustDayExpectationDenial };

/**
 * Supervisor+ may increment today's expected time. Quick PIN is allowed (Run, not Build).
 * Ordinary employees cannot adjust. Build milestone times are never written.
 */
export async function adjustMealServiceDayExpectation(
  input: AdjustDayExpectationInput,
  client: DbClient = prisma,
): Promise<AdjustDayExpectationResult> {
  const row = await client.operationalCycleDayExpectation.findFirst({
    where: { id: input.expectationId },
    select: {
      id: true,
      facilityId: true,
      departmentId: true,
      configuredTime: true,
      adjustedTime: true,
    },
  });
  if (!row) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const decision = decideAdjustDayExpectationAuthority({
    sessionFacilityId: input.session.facilityId,
    expectationFacilityId: row.facilityId,
    role: input.session.role as AppRole,
    authKind: input.session.authKind,
  });
  if (!decision.allowed) {
    return { ok: false, reason: decision.reason };
  }

  const authority = await resolveCycleAuthority(
    input.session,
    row.facilityId,
    row.departmentId,
  );
  if (!authority.canViewRuntime) {
    return { ok: false, reason: "ROLE_REQUIRED" };
  }

  let nextAdjusted: string | null = null;
  if (typeof input.addMinutes === "number") {
    if (!Number.isFinite(input.addMinutes) || input.addMinutes === 0) {
      return { ok: false, reason: "INVALID_MINUTES" };
    }
    const baseline = expectedTodayTime(row);
    if (!baseline) {
      return { ok: false, reason: "NOT_CONFIGURED" };
    }
    nextAdjusted = addMinutesToLocalTime(baseline, input.addMinutes);
  } else if (input.adjustedTime) {
    nextAdjusted = addMinutesToLocalTime(input.adjustedTime, 0);
  }

  if (!nextAdjusted) {
    return { ok: false, reason: "INVALID_TIME" };
  }

  const actorUserId = sessionUserIdForFk(input.session);
  const actorEmployeeId =
    input.session.authKind === "employee" ? input.session.uid : null;

  const updated = await client.operationalCycleDayExpectation.update({
    where: { id: row.id },
    data: {
      adjustedTime: nextAdjusted,
      adjustmentReason: input.reason?.trim() || null,
      adjustedAt: new Date(),
      adjustedByUserId: actorUserId,
      adjustedByEmployeeId: actorEmployeeId,
    },
    select: {
      id: true,
      configuredTime: true,
      adjustedTime: true,
    },
  });

  return {
    ok: true,
    expectationId: updated.id,
    configuredTime: updated.configuredTime,
    adjustedTime: updated.adjustedTime!,
    expectedToday: expectedTodayTime(updated)!,
  };
}
