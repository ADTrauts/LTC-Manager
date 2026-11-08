import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { enqueueNotificationEvent, type NotificationIntakeResult } from "./outbox";
import { processNotificationOutboxRow } from "./processing";
import { assignmentChangeIntakeDedupeKey } from "./thread-key";

/**
 * Policy support and a live publisher are separate.
 * A policy function can evaluate a fixture. Only this list may be written
 * from an owning-domain transaction.
 */
/**
 * State-driven Coverage transitions are live from Assignment writes and plan
 * confirmation. Scheduled Evaluation writes the time-driven attention events.
 * Work Order overdue is live from the deadline write and from that clock.
 * evidence.failed is live from the Record submission that marks it out of standard.
 * issue.created is live from the Issue write. Issue priority is not notification priority.
 * work_order.intervention_required is live from the Immediate response opening.
 * Clearing ends it. Completion resolves it. Cancellation ends it.
 * Repair.priority is not that priority.
 * asset.out_of_service is live from the Asset status transition.
 * asset.returned_to_service resolves that outage. asset.outage_ended ends it on retirement.
 * Asset criticality is not notification priority. On-call coverage names the responder.
 * This file does not decide when they run.
 */
export const LIVE_PUBLISHER_ENABLED = [
  "assignment.changed",
  "coverage.became_at_risk",
  "coverage.became_uncovered",
  "coverage.restored",
  "attention.reevaluate",
  "attention.expired",
  "milestone.overdue",
  "milestone.recorded",
  "milestone.deadline_moved",
  "work_order.assigned",
  "work_order.assignment_ended",
  "work_order.overdue",
  "work_order.overdue_resolved",
  "work_order.overdue_ended",
  "work_order.intervention_required",
  "work_order.intervention_cleared",
  "work_order.intervention_completed",
  "work_order.intervention_cancelled",
  "evidence.failed",
  "issue.created",
  "asset.out_of_service",
  "asset.returned_to_service",
  "asset.outage_ended",
] as const;

export type LivePublisherEvent = (typeof LIVE_PUBLISHER_ENABLED)[number];

const LIVE_PUBLISHER_SET: ReadonlySet<string> = new Set(LIVE_PUBLISHER_ENABLED);

export function isLivePublisherEnabled(eventType: string): eventType is LivePublisherEvent {
  return LIVE_PUBLISHER_SET.has(eventType);
}

/**
 * The Assignment write does not own whether service is active.
 * Operational Cycle owns that fact. Until a publisher receives it,
 * the live event stays an Update and does not claim Needs Attention.
 */
const LIVE_ASSIGNMENT_SERVICE_STATE = "inactive" as const;

export async function enqueueAssignmentChanged(
  tx: Prisma.TransactionClient,
  input: {
    facilityId: string;
    departmentId: string;
    assignmentId: string;
    assignmentEventId: string;
    serviceDate: string;
    assigneeEmployeeId: string;
    subjectLabel: string;
    occurredAt: Date;
    unitId?: string | null;
    spaceId?: string | null;
  },
): Promise<NotificationIntakeResult> {
  const subjectLabel = input.subjectLabel.trim().slice(0, 80) || "An assignment changed";
  return enqueueNotificationEvent(tx, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    eventType: "assignment.changed",
    aggregateType: "assignment_change",
    aggregateId: input.assignmentEventId,
    occurredAt: input.occurredAt,
    dedupeKey: assignmentChangeIntakeDedupeKey(input.assignmentEventId),
    payload: {
      assignmentId: input.assignmentId,
      assignmentEventId: input.assignmentEventId,
      serviceDate: input.serviceDate,
      assigneeEmployeeId: input.assigneeEmployeeId,
      serviceState: LIVE_ASSIGNMENT_SERVICE_STATE,
      subjectLabel,
      ...(input.unitId ? { unitId: input.unitId } : {}),
      ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    },
  });
}

/**
 * Runs after the source transaction commits. A processing failure leaves the
 * Assignment committed and the outbox row durable.
 */
export async function processNotificationOutboxAfterCommit(outboxId: string | null): Promise<void> {
  if (!outboxId) return;
  try {
    await processNotificationOutboxRow(prisma, { outboxId });
  } catch {
    // The source fact is already committed. Retry reads the same outbox row.
  }
}
