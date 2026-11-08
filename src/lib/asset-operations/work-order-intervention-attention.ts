/**
 * Immediate Work Order response attention.
 *
 * The Work Order already decided the response requirement and wrote the
 * history row. This file publishes that row. It does not read Repair.priority,
 * and it does not assign the on-call responder to the Work Order.
 */

import type { Prisma } from "@prisma/client";

import { enqueueNotificationEvent } from "@/lib/notifications/outbox";
import {
  workOrderInterventionCancelledIntakeDedupeKey,
  workOrderInterventionClearedIntakeDedupeKey,
  workOrderInterventionCompletedIntakeDedupeKey,
  workOrderInterventionIntakeDedupeKey,
} from "@/lib/notifications/thread-key";

type Tx = Prisma.TransactionClient;

type InterventionContext = {
  facilityId: string;
  departmentId: string;
  repairId: string;
  unitId: string;
  spaceId: string | null;
  locationLabel: string;
  subjectLabel: string;
};

async function loadInterventionContext(tx: Tx, repairId: string): Promise<InterventionContext | null> {
  const repair = await tx.repair.findFirst({
    where: { id: repairId },
    select: {
      id: true,
      title: true,
      unitId: true,
      spaceId: true,
      responsibleDepartmentId: true,
      requestingDepartmentId: true,
      unit: { select: { facilityId: true, name: true } },
      space: { select: { name: true } },
    },
  });
  const departmentId = repair?.responsibleDepartmentId ?? repair?.requestingDepartmentId ?? null;
  if (!repair || !departmentId) return null;
  return {
    facilityId: repair.unit.facilityId,
    departmentId,
    repairId: repair.id,
    unitId: repair.unitId,
    spaceId: repair.spaceId,
    locationLabel: [repair.unit.name, repair.space?.name].filter(Boolean).join(" · ").slice(0, 120),
    subjectLabel: repair.title.trim().slice(0, 80) || "Work Order",
  };
}

export async function enqueueWorkOrderInterventionOpened(
  tx: Tx,
  input: { repairId: string; openingHistoryId: string; occurredAt: Date },
): Promise<string[]> {
  const context = await loadInterventionContext(tx, input.repairId);
  if (!context) return [];
  const result = await enqueueNotificationEvent(tx, {
    facilityId: context.facilityId,
    departmentId: context.departmentId,
    eventType: "work_order.intervention_required",
    aggregateType: "work_order_response",
    aggregateId: input.openingHistoryId,
    occurredAt: input.occurredAt,
    dedupeKey: workOrderInterventionIntakeDedupeKey(input.openingHistoryId),
    payload: {
      repairId: context.repairId,
      openingHistoryId: input.openingHistoryId,
      unitId: context.unitId,
      spaceId: context.spaceId,
      locationLabel: context.locationLabel,
      subjectLabel: context.subjectLabel,
    },
  });
  return [result.id];
}

export async function enqueueWorkOrderInterventionTerminal(
  tx: Tx,
  input: {
    repairId: string;
    openingHistoryId: string;
    terminalHistoryId: string;
    transition: "CLEARED" | "COMPLETED" | "CANCELLED";
    occurredAt: Date;
  },
): Promise<string[]> {
  const context = await loadInterventionContext(tx, input.repairId);
  if (!context) return [];
  const eventType =
    input.transition === "CLEARED"
      ? "work_order.intervention_cleared"
      : input.transition === "COMPLETED"
        ? "work_order.intervention_completed"
        : "work_order.intervention_cancelled";
  const dedupeKey =
    input.transition === "CLEARED"
      ? workOrderInterventionClearedIntakeDedupeKey(input.terminalHistoryId)
      : input.transition === "COMPLETED"
        ? workOrderInterventionCompletedIntakeDedupeKey(input.terminalHistoryId)
        : workOrderInterventionCancelledIntakeDedupeKey(input.terminalHistoryId);
  const endedReason =
    input.transition === "CLEARED"
      ? "intervention_cleared"
      : input.transition === "CANCELLED"
        ? "work_order_cancelled"
        : null;
  const result = await enqueueNotificationEvent(tx, {
    facilityId: context.facilityId,
    departmentId: context.departmentId,
    eventType,
    aggregateType: "work_order_response",
    aggregateId: input.terminalHistoryId,
    occurredAt: input.occurredAt,
    dedupeKey,
    payload: {
      repairId: context.repairId,
      openingHistoryId: input.openingHistoryId,
      ...(endedReason ? { endedReason } : {}),
    },
  });
  return [result.id];
}
