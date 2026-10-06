/**
 * Explicit Preventive Maintenance occurrence skip.
 * Supervisor+ only. Reason required. Cadence is unchanged.
 * Refused when an active Work Order is linked.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { WAIVE_REASON_MIN_LENGTH } from "@/lib/asset-operations/work-order-closeout-gate";
import { prisma } from "@/lib/prisma";

import { isPmActiveWorkOrderStatus } from "./active-work-order";
import { requirePmSkip, resolvePmPlanAuthority } from "./authority";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const SKIP_REASON_MIN_LENGTH = WAIVE_REASON_MIN_LENGTH;

export async function skipPmOccurrence(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    occurrenceId: string;
    reason: string;
    client?: DbClient;
    now?: Date;
  },
) {
  const client = input.client ?? prisma;
  const authority = await resolvePmPlanAuthority(
    session,
    input.facilityId,
    input.departmentId,
    client,
  );
  requirePmSkip(authority);

  const reason = input.reason.trim();
  if (reason.length < SKIP_REASON_MIN_LENGTH) {
    throw new Error(`A skip reason of at least ${SKIP_REASON_MIN_LENGTH} characters is required.`);
  }

  const occurrence = await client.preventiveMaintenanceOccurrence.findFirst({
    where: {
      id: input.occurrenceId,
      plan: { facilityId: input.facilityId, departmentId: input.departmentId },
    },
    include: {
      workOrders: { select: { id: true, status: true } },
    },
  });
  if (!occurrence) throw new Error("Preventive Maintenance occurrence not found.");
  if (occurrence.status === "SKIPPED") return occurrence;
  if (occurrence.status === "COMPLETED") {
    throw new Error("Completed Preventive Maintenance occurrences cannot be skipped.");
  }

  const active = occurrence.workOrders.find((row) => isPmActiveWorkOrderStatus(row.status));
  if (active) {
    throw new Error(
      "Cannot skip an occurrence with an active Work Order. Complete or cancel the Work Order first.",
    );
  }

  const now = input.now ?? new Date();
  return client.preventiveMaintenanceOccurrence.update({
    where: { id: occurrence.id },
    data: {
      status: "SKIPPED",
      skippedAt: now,
      skippedByUserId: sessionUserIdForFk(session),
      skipReason: reason,
    },
  });
}
