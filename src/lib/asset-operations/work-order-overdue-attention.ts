/**
 * Work Order overdue attention.
 * The Work Order owns the deadline. This file publishes that fact.
 * It does not decide the deadline, and it does not read Work Order priority.
 */

import type { Prisma } from "@prisma/client";

import { enqueueNotificationEvent } from "@/lib/notifications/outbox";
import {
  workOrderOverdueAssigneeIntakeDedupeKey,
  workOrderOverdueEndedIntakeDedupeKey,
  workOrderOverdueIntakeDedupeKey,
  workOrderOverdueResolvedIntakeDedupeKey,
} from "@/lib/notifications/thread-key";

import { evaluateWorkOrderDueState } from "./work-order-due-state";

type Tx = Prisma.TransactionClient;

export type WorkOrderDueSnapshot = {
  status: string;
  dueAt: Date | null;
  assignedEmployeeId: string | null;
};

async function loadWorkOrder(tx: Tx, repairId: string) {
  return tx.repair.findFirst({
    where: { id: repairId },
    select: {
      id: true,
      title: true,
      dueAt: true,
      assignedEmployeeId: true,
      responsibleDepartmentId: true,
      requestingDepartmentId: true,
      unit: { select: { facilityId: true, name: true } },
      space: { select: { name: true } },
    },
  });
}

export async function enqueueWorkOrderOverdue(
  tx: Tx,
  input: {
    repairId: string;
    dueAt: Date;
    assigneeEmployeeId: string | null;
    occurredAt: Date;
    intake: "deadline" | "assignee";
    historyEventId?: string | null;
  },
): Promise<string> {
  const repair = await loadWorkOrder(tx, input.repairId);
  if (!repair?.unit.facilityId) {
    throw new Error("Work Order overdue requires the Work Order facility");
  }
  const place = [repair.space?.name, repair.unit.name].filter(Boolean).join(", ");
  const result = await enqueueNotificationEvent(tx, {
    facilityId: repair.unit.facilityId,
    departmentId: repair.responsibleDepartmentId ?? repair.requestingDepartmentId,
    eventType: "work_order.overdue",
    aggregateType: "work_order_overdue",
    aggregateId: repair.id,
    occurredAt: input.occurredAt,
    dedupeKey:
      input.intake === "assignee"
        ? workOrderOverdueAssigneeIntakeDedupeKey(repair.id, input.dueAt, input.assigneeEmployeeId)
        : workOrderOverdueIntakeDedupeKey(repair.id, input.dueAt, input.historyEventId),
    payload: {
      repairId: repair.id,
      dueAt: input.dueAt.toISOString(),
      assigneeEmployeeId: input.assigneeEmployeeId,
      locationLabel: place || repair.unit.name,
      subjectLabel: repair.title,
    },
  });
  return result.id;
}

export async function enqueueWorkOrderOverdueEnded(
  tx: Tx,
  input: {
    repairId: string;
    historyEventId: string;
    occurredAt: Date;
    endedReason: "deadline_moved" | "deadline_removed" | "work_order_cancelled";
  },
): Promise<string> {
  const repair = await loadWorkOrder(tx, input.repairId);
  if (!repair?.unit.facilityId) {
    throw new Error("Work Order overdue requires the Work Order facility");
  }
  const result = await enqueueNotificationEvent(tx, {
    facilityId: repair.unit.facilityId,
    departmentId: repair.responsibleDepartmentId ?? repair.requestingDepartmentId,
    eventType: "work_order.overdue_ended",
    aggregateType: "work_order_overdue",
    aggregateId: input.historyEventId,
    occurredAt: input.occurredAt,
    dedupeKey: workOrderOverdueEndedIntakeDedupeKey(input.historyEventId),
    payload: {
      repairId: repair.id,
      endedReason: input.endedReason,
    },
  });
  return result.id;
}

export async function enqueueWorkOrderOverdueResolved(
  tx: Tx,
  input: { repairId: string; historyEventId: string; occurredAt: Date },
): Promise<string> {
  const repair = await loadWorkOrder(tx, input.repairId);
  if (!repair?.unit.facilityId) {
    throw new Error("Work Order overdue requires the Work Order facility");
  }
  const result = await enqueueNotificationEvent(tx, {
    facilityId: repair.unit.facilityId,
    departmentId: repair.responsibleDepartmentId ?? repair.requestingDepartmentId,
    eventType: "work_order.overdue_resolved",
    aggregateType: "work_order_overdue",
    aggregateId: input.historyEventId,
    occurredAt: input.occurredAt,
    dedupeKey: workOrderOverdueResolvedIntakeDedupeKey(input.historyEventId),
    payload: { repairId: repair.id },
  });
  return result.id;
}

/**
 * Publish the overdue transition the Work Order write already knows.
 * The clock uses enqueueWorkOrderOverdue directly for a time-only crossing.
 */
export async function syncWorkOrderDueAttention(
  tx: Tx,
  input: {
    repairId: string;
    before: WorkOrderDueSnapshot;
    after: WorkOrderDueSnapshot;
    historyEventId: string | null;
    occurredAt: Date;
  },
): Promise<string[]> {
  const beforeState = evaluateWorkOrderDueState({
    status: input.before.status,
    dueAt: input.before.dueAt,
    now: input.occurredAt,
  });
  const afterState = evaluateWorkOrderDueState({
    status: input.after.status,
    dueAt: input.after.dueAt,
    now: input.occurredAt,
  });
  const dueChanged = (input.before.dueAt?.getTime() ?? null) !== (input.after.dueAt?.getTime() ?? null);
  const assigneeChanged = input.before.assignedEmployeeId !== input.after.assignedEmployeeId;

  if (afterState === "OVERDUE" && input.after.dueAt) {
    const opened = beforeState !== "OVERDUE" || dueChanged;
    if (!opened && !assigneeChanged) return [];
    return [
      await enqueueWorkOrderOverdue(tx, {
        repairId: input.repairId,
        dueAt: input.after.dueAt,
        assigneeEmployeeId: input.after.assignedEmployeeId,
        occurredAt: input.occurredAt,
        intake: opened ? "deadline" : "assignee",
        historyEventId: input.historyEventId,
      }),
    ];
  }

  if (beforeState !== "OVERDUE" || !input.historyEventId) return [];
  if (input.after.status === "COMPLETED") {
    return [
      await enqueueWorkOrderOverdueResolved(tx, {
        repairId: input.repairId,
        historyEventId: input.historyEventId,
        occurredAt: input.occurredAt,
      }),
    ];
  }
  const endedReason =
    input.after.status === "CANCELLED"
      ? "work_order_cancelled"
      : input.after.dueAt
        ? "deadline_moved"
        : "deadline_removed";
  return [
    await enqueueWorkOrderOverdueEnded(tx, {
      repairId: input.repairId,
      historyEventId: input.historyEventId,
      occurredAt: input.occurredAt,
      endedReason,
    }),
  ];
}
