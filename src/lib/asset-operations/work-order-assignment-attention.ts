/**
 * Work Order assignment attention.
 *
 * The Work Order owns who is assigned. This module records that change and
 * asks Notifications to tell the assignee. It does not choose priority from
 * the Work Order's own priority, and it does not write a Notification row.
 */

import type { Prisma, PrismaClient, Repair, RepairStatus } from "@prisma/client";

import { enqueueNotificationEvent } from "@/lib/notifications/outbox";
import { processNotificationOutboxRow } from "@/lib/notifications/processing";
import {
  workOrderAssignmentEndedIntakeDedupeKey,
  workOrderAssignmentIntakeDedupeKey,
} from "@/lib/notifications/thread-key";

import { newWorkOrderCuid, type DbClient } from "./work-order-access";

export type WorkOrderAssignmentEndCause = "unassigned" | "completed" | "cancelled";

type AttentionContext = {
  facilityId: string;
  departmentId: string | null;
  locationLabel: string;
  subjectLabel: string;
  assignedEmployeeId: string | null;
  status: RepairStatus;
};

async function loadAttentionContext(
  tx: Prisma.TransactionClient,
  repairId: string,
): Promise<AttentionContext & { id: string }> {
  const repair = await tx.repair.findFirst({
    where: { id: repairId },
    select: {
      id: true,
      title: true,
      status: true,
      assignedEmployeeId: true,
      responsibleDepartmentId: true,
      requestingDepartmentId: true,
      unit: { select: { facilityId: true, name: true } },
      space: { select: { name: true } },
    },
  });
  if (!repair) throw new Error("Work Order not found.");
  return {
    id: repair.id,
    facilityId: repair.unit.facilityId,
    departmentId: repair.responsibleDepartmentId ?? repair.requestingDepartmentId,
    locationLabel: repair.space?.name?.trim() || repair.unit.name,
    subjectLabel: repair.title.trim().slice(0, 80) || "Work Order",
    assignedEmployeeId: repair.assignedEmployeeId,
    status: repair.status,
  };
}

export async function enqueueWorkOrderAssigned(
  tx: Prisma.TransactionClient,
  input: {
    repairId: string;
    assignmentEventId: string;
    assigneeEmployeeId: string;
    occurredAt: Date;
  },
): Promise<string> {
  const context = await loadAttentionContext(tx, input.repairId);
  const result = await enqueueNotificationEvent(tx, {
    facilityId: context.facilityId,
    departmentId: context.departmentId,
    eventType: "work_order.assigned",
    aggregateType: "work_order_assignment",
    aggregateId: input.assignmentEventId,
    occurredAt: input.occurredAt,
    dedupeKey: workOrderAssignmentIntakeDedupeKey(input.assignmentEventId),
    payload: {
      repairId: context.id,
      assignmentEventId: input.assignmentEventId,
      assigneeEmployeeId: input.assigneeEmployeeId,
      locationLabel: context.locationLabel,
      subjectLabel: context.subjectLabel,
    },
  });
  return result.id;
}

export async function enqueueWorkOrderAssignmentEnded(
  tx: Prisma.TransactionClient,
  input: {
    repairId: string;
    assignmentEventId: string;
    occurredAt: Date;
    cause: WorkOrderAssignmentEndCause;
  },
): Promise<string> {
  const context = await loadAttentionContext(tx, input.repairId);
  const result = await enqueueNotificationEvent(tx, {
    facilityId: context.facilityId,
    departmentId: context.departmentId,
    eventType: "work_order.assignment_ended",
    aggregateType: "work_order_assignment",
    aggregateId: input.assignmentEventId,
    occurredAt: input.occurredAt,
    dedupeKey: workOrderAssignmentEndedIntakeDedupeKey(input.assignmentEventId),
    payload: {
      repairId: context.id,
      assignmentEventId: input.assignmentEventId,
      endedReason: "responsibility_ended",
      cause: input.cause,
    },
  });
  return result.id;
}

async function writeAssignmentHistory(
  tx: Prisma.TransactionClient,
  input: {
    repairId: string;
    updateText: string;
    statusAfterUpdate: RepairStatus;
    actorUserId: string | null;
  },
): Promise<string> {
  const row = await tx.repairUpdate.create({
    data: {
      id: newWorkOrderCuid(),
      repairId: input.repairId,
      updateText: input.updateText,
      statusAfterUpdate: input.statusAfterUpdate,
      updatedById: input.actorUserId,
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Changes the assignee when it actually changed, writes the history row, and
 * enqueues attention in the same transaction.
 * The same Employee is not a new assignment.
 * Clearing the Employee ends prior attention and does not emit work_order.assigned.
 */
export async function applyWorkOrderAssigneeChange(
  tx: Prisma.TransactionClient,
  input: {
    repairId: string;
    nextEmployeeId: string | null;
    actorUserId: string | null;
    occurredAt: Date;
    comment?: string | null;
    responsibleDepartmentId?: string | null;
  },
): Promise<{ repair: Repair; outboxIds: string[] }> {
  const current = await tx.repair.findFirst({
    where: { id: input.repairId },
  });
  if (!current) throw new Error("Work Order not found.");

  const nextEmployeeId = input.nextEmployeeId;
  const assigneeChanged = current.assignedEmployeeId !== nextEmployeeId;
  const departmentProvided = input.responsibleDepartmentId !== undefined;
  const departmentChanged =
    departmentProvided && input.responsibleDepartmentId !== current.responsibleDepartmentId;
  const comment = input.comment?.trim() || null;

  if (!assigneeChanged && !departmentChanged && !comment) {
    return { repair: current, outboxIds: [] };
  }

  const nextStatus: RepairStatus =
    nextEmployeeId && current.status === "OPEN" ? "ASSIGNED" : current.status;
  const repair = await tx.repair.update({
    where: { id: current.id },
    data: {
      ...(assigneeChanged ? { assignedEmployeeId: nextEmployeeId } : {}),
      ...(departmentProvided ? { responsibleDepartmentId: input.responsibleDepartmentId } : {}),
      ...(nextStatus !== current.status ? { status: nextStatus } : {}),
    },
  });

  if (!assigneeChanged) {
    await writeAssignmentHistory(tx, {
      repairId: repair.id,
      updateText: comment ?? "Responsible department updated",
      statusAfterUpdate: repair.status,
      actorUserId: input.actorUserId,
    });
    return { repair, outboxIds: [] };
  }

  const historyText = nextEmployeeId
    ? comment
      ? `Work Order assigned. ${comment}`
      : "Work Order assigned"
    : comment
      ? `Responsible employee cleared. ${comment}`
      : "Responsible employee cleared";
  const historyId = await writeAssignmentHistory(tx, {
    repairId: repair.id,
    updateText: historyText,
    statusAfterUpdate: repair.status,
    actorUserId: input.actorUserId,
  });
  const outboxId = nextEmployeeId
    ? await enqueueWorkOrderAssigned(tx, {
        repairId: repair.id,
        assignmentEventId: historyId,
        assigneeEmployeeId: nextEmployeeId,
        occurredAt: input.occurredAt,
      })
    : await enqueueWorkOrderAssignmentEnded(tx, {
        repairId: repair.id,
        assignmentEventId: historyId,
        occurredAt: input.occurredAt,
        cause: "unassigned",
      });
  return { repair, outboxIds: [outboxId] };
}

/** Initial create already stored the assignee. This records that first assignment. */
export async function recordInitialWorkOrderAssignment(
  tx: Prisma.TransactionClient,
  input: {
    repairId: string;
    actorUserId: string | null;
    occurredAt: Date;
  },
): Promise<string[]> {
  const context = await loadAttentionContext(tx, input.repairId);
  if (!context.assignedEmployeeId) return [];
  const historyId = await writeAssignmentHistory(tx, {
    repairId: input.repairId,
    updateText: "Work Order assigned",
    statusAfterUpdate: context.status,
    actorUserId: input.actorUserId,
  });
  const outboxId = await enqueueWorkOrderAssigned(tx, {
    repairId: input.repairId,
    assignmentEventId: historyId,
    assigneeEmployeeId: context.assignedEmployeeId,
    occurredAt: input.occurredAt,
  });
  return [outboxId];
}

export async function runWorkOrderMutation<T>(
  client: DbClient,
  run: (tx: Prisma.TransactionClient) => Promise<{ value: T; attentionOutboxIds: string[] }>,
): Promise<T> {
  const root = client as PrismaClient;
  if (typeof root.$transaction !== "function") {
    const nested = await run(client as Prisma.TransactionClient);
    return nested.value;
  }
  const result = await root.$transaction((tx) => run(tx));
  for (const outboxId of result.attentionOutboxIds) {
    try {
      await processNotificationOutboxRow(root, { outboxId });
    } catch {
      // The Work Order is already committed. The outbox row stays retryable.
    }
  }
  return result.value;
}

export async function processWorkOrderAttention(
  client: PrismaClient,
  outboxIds: string[],
): Promise<void> {
  for (const outboxId of outboxIds) {
    try {
      await processNotificationOutboxRow(client, { outboxId });
    } catch {
      // The Work Order is already committed. The outbox row stays retryable.
    }
  }
}
