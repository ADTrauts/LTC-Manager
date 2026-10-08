/**
 * Date-specific timing adjustments for one Cycle, Phase, or Key Point.
 * The published version is not modified. Child nodes are not shifted.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import type { AppRole } from "@/lib/access";
import type { FacilitySession } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { hasPlatformCapability } from "@/lib/platform-capability";
import { prisma } from "@/lib/prisma";

import { validateTimingAdjustment } from "./cycle-canonical";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type RecordTimingAdjustmentInput = {
  session: FacilitySession;
  cycleId: string;
  serviceDate: Date;
  adjustedStartLocal?: string | null;
  adjustedEndLocal?: string | null;
  adjustedDueLocal?: string | null;
  reason: string;
};

export async function recordOperationalTimingAdjustment(
  input: RecordTimingAdjustmentInput,
  client: DbClient = prisma,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const allowed = hasPlatformCapability({
    capability: "operational_timing.adjust",
    role: input.session.role as AppRole,
    authKind: input.session.authKind,
  });
  if (!allowed) return { ok: false, message: "Operational timing adjustment is not allowed." };

  const actorId =
    sessionUserIdForFk(input.session) ??
    (input.session.authKind === "employee" ? input.session.uid : null);
  const check = validateTimingAdjustment({
    reason: input.reason,
    actorId,
    adjustedStartLocal: input.adjustedStartLocal,
    adjustedEndLocal: input.adjustedEndLocal,
    adjustedDueLocal: input.adjustedDueLocal,
  });
  if (!check.ok) return check;

  const cycle = await client.departmentOperationalCycle.findFirst({
    where: { id: input.cycleId, facilityId: input.session.facilityId, status: "PUBLISHED" },
    select: {
      id: true,
      facilityId: true,
      departmentId: true,
      stableKey: true,
      version: true,
      startLocal: true,
      endLocal: true,
    },
  });
  if (!cycle) return { ok: false, message: "Published cycle was not found." };

  const row = await client.operationalCycleTimingAdjustment.create({
    data: {
      facilityId: cycle.facilityId,
      departmentId: cycle.departmentId,
      serviceDate: input.serviceDate,
      cycleId: cycle.id,
      cycleStableKey: cycle.stableKey,
      cycleVersion: cycle.version,
      adjustedStartLocal: input.adjustedStartLocal?.trim() || null,
      adjustedEndLocal: input.adjustedEndLocal?.trim() || null,
      adjustedDueLocal: input.adjustedDueLocal?.trim() || null,
      reason: input.reason.trim(),
      actorUserId: sessionUserIdForFk(input.session),
      actorEmployeeId: input.session.authKind === "employee" ? input.session.uid : null,
    },
    select: { id: true },
  });

  const unchanged = await client.departmentOperationalCycle.findFirst({
    where: { id: cycle.id },
    select: { startLocal: true, endLocal: true, version: true },
  });
  if (
    unchanged?.startLocal !== cycle.startLocal ||
    unchanged?.endLocal !== cycle.endLocal ||
    unchanged?.version !== cycle.version
  ) {
    return { ok: false, message: "Published timing was changed." };
  }

  return { ok: true, id: row.id };
}
