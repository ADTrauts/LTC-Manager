/**
 * N1C outbox processor.
 *
 * An outbox row becomes attention state: one thread, resolved recipients, and
 * one in-app delivery each. The notification is not the operational fact.
 * Tests call this directly. Scheduled Evaluation may enqueue a row, then call
 * this after the domain transaction commits. This module does not read a clock.
 */

import {
  NotificationDeliveryChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import { isNotificationEventType } from "./event-types";
import { parseNotificationPayload, type ParsedNotificationPayload } from "./payload";
import { initialEscalationTiming } from "./escalation";
import { enqueuePriorityRiseIfStrict, enqueuePushForNewRecipient } from "./push-dispatch";
import { runPushDeliveryAfterCommit } from "./push-delivery";
import { priorityRiseClearsSnooze } from "./response-policy";
import { evaluateAttentionPolicy, type AttentionPolicyResult } from "./policy-registry";
import {
  assignmentPresentation,
  coveragePresentation,
  keyPointPresentation,
  publicationPresentation,
  workOrderAssignmentPresentation,
  evidenceFailedPresentation,
  issueCreatedPresentation,
  assetOutOfServicePresentation,
  workOrderInterventionPresentation,
  workOrderOverduePresentation,
} from "./presentation";
import {
  resolveNotificationRecipients,
  type RecipientResolution,
  type UnresolvedRecipient,
} from "./recipient-resolver";

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  UPDATE: 0,
  NEEDS_ATTENTION: 1,
  URGENT: 2,
  CRITICAL: 3,
};

export const PROCESS_PENDING_LIMIT = 20;

export type NotificationProcessingResult = {
  outcome:
    | "applied"
    | "resolved"
    | "resolve_noop"
    | "expired"
    | "expire_noop"
    | "priority_held"
    | "already_processed"
    | "unsupported"
    | "deferred"
    | "invalid_payload"
    | "not_found"
    | "failed";
  outboxId: string;
  notificationId: string | null;
  recipientCount: number;
  unresolved: Array<{ reason: string | null; cause: string }>;
  note: string | null;
};

type ThreadWrite = {
  kind: Prisma.NotificationCreateInput["kind"];
  category: string;
  priority: NotificationPriority;
  requiresAcknowledgement: boolean;
  title: string;
  body: string;
  actionPath: string | null;
  sourceType: string;
  sourceId: string;
  metadata: Prisma.InputJsonValue;
  policyVersion: string;
  escalationEligible: boolean;
};

export function outboxEvaluationNote(kind: "unsupported" | "deferred" | "invalid_payload", code: string): string {
  return `${kind}:${code}`.slice(0, 200);
}

export function keepsCurrentPriority(current: NotificationPriority, incoming: NotificationPriority): boolean {
  return PRIORITY_RANK[incoming] < PRIORITY_RANK[current];
}

function unresolvedFacts(rows: UnresolvedRecipient[]) {
  return rows
    .filter((row) => row.source === "reason" && row.reason)
    .map((row) => ({ reason: row.reason, cause: row.cause }));
}

function safeFailure(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return `database:${error.code}`;
  return "processing_failed";
}

export async function processNotificationOutboxRow(
  db: PrismaClient,
  input: { outboxId: string },
): Promise<NotificationProcessingResult> {
  try {
    const result = await db.$transaction((tx) => applyOutboxRow(tx, input.outboxId), { timeout: 15000 });
    await runPushDeliveryAfterCommit(db);
    return result;
  } catch (error) {
    await db.notificationOutbox.updateMany({
      where: { id: input.outboxId, processedAt: null },
      data: { attemptCount: { increment: 1 }, lastError: safeFailure(error) },
    });
    return {
      outcome: "failed",
      outboxId: input.outboxId,
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: safeFailure(error),
    };
  }
}

export async function processPendingNotificationOutbox(
  db: PrismaClient,
  input: { limit?: number; facilityId?: string } = {},
): Promise<NotificationProcessingResult[]> {
  const limit = Math.min(Math.max(input.limit ?? PROCESS_PENDING_LIMIT, 1), 50);
  const rows = await db.notificationOutbox.findMany({
    where: {
      processedAt: null,
      ...(input.facilityId ? { facilityId: input.facilityId } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true },
  });
  const results: NotificationProcessingResult[] = [];
  for (const row of rows) {
    results.push(await processNotificationOutboxRow(db, { outboxId: row.id }));
  }
  return results;
}

async function applyOutboxRow(
  tx: Prisma.TransactionClient,
  outboxId: string,
): Promise<NotificationProcessingResult> {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "NotificationOutbox" WHERE "id" = ${outboxId} FOR UPDATE`);
  const row = await tx.notificationOutbox.findUnique({ where: { id: outboxId } });
  if (!row) {
    return {
      outcome: "not_found",
      outboxId,
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: null,
    };
  }
  if (row.processedAt) {
    return {
      outcome: "already_processed",
      outboxId,
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: null,
    };
  }

  if (!isNotificationEventType(row.eventType)) {
    return finish(tx, row.id, {
      outcome: "invalid_payload",
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: outboxEvaluationNote("invalid_payload", "unknown_event"),
    });
  }

  const parsed = parseNotificationPayload({
    eventType: row.eventType,
    facilityId: row.facilityId,
    departmentId: row.departmentId,
    payload: row.payload,
  });
  if (!parsed.ok) {
    return finish(tx, row.id, {
      outcome: "invalid_payload",
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: outboxEvaluationNote("invalid_payload", parsed.code),
    });
  }
  if (parsed.parsed.kind === "sync_deferred") {
    return finish(tx, row.id, {
      outcome: "deferred",
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: outboxEvaluationNote("deferred", "sync_not_processable"),
    });
  }

  const policy =
    parsed.parsed.kind === "catalog_only"
      ? evaluateAttentionPolicy({ eventType: parsed.parsed.eventType })
      : evaluateAttentionPolicy(parsed.parsed.policyInput);

  if (policy.outcome === "unsupported") {
    return finish(tx, row.id, {
      outcome: "unsupported",
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: outboxEvaluationNote("unsupported", policy.reason),
    });
  }
  if (policy.outcome === "resolve") {
    return resolveThread(tx, row, parsed.parsed, policy);
  }
  if (policy.outcome === "expire") {
    return expireThread(tx, row, parsed.parsed, policy);
  }
  return notifyThread(tx, row, parsed.parsed, policy);
}

async function expireThread(
  tx: Prisma.TransactionClient,
  row: { id: string; facilityId: string; occurredAt: Date },
  parsed: ParsedNotificationPayload,
  policy: Extract<AttentionPolicyResult, { outcome: "expire" }>,
): Promise<NotificationProcessingResult> {
  if (parsed.kind === "work_order_end") {
    const ended = await endWorkOrderAssignmentAttention(tx, {
      facilityId: row.facilityId,
      repairId: parsed.repairId,
      occurredAt: row.occurredAt,
      endedReason: "responsibility_ended",
    });
    return finish(tx, row.id, {
      outcome: ended > 0 ? "expired" : "expire_noop",
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: null,
    });
  }
  if (
    parsed.kind !== "coverage" &&
    parsed.kind !== "key_point" &&
    parsed.kind !== "work_order_overdue_end" &&
    parsed.kind !== "work_order_intervention_end" &&
    parsed.kind !== "asset_outage_end"
  ) {
    return finish(tx, row.id, {
      outcome: "unsupported",
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: outboxEvaluationNote("unsupported", "expire_without_coverage_thread"),
    });
  }
  const existing = await tx.notification.findUnique({
    where: { facilityId_dedupeKey: { facilityId: row.facilityId, dedupeKey: parsed.threadKey } },
    select: { id: true, resolvedAt: true, expiresAt: true, metadata: true },
  });
  if (!existing || existing.resolvedAt || existing.expiresAt) {
    return finish(tx, row.id, {
      outcome: "expire_noop",
      notificationId: existing?.id ?? null,
      recipientCount: 0,
      unresolved: [],
      note: null,
    });
  }
  const prior =
    existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? existing.metadata
      : {};
  await tx.notification.update({
    where: { id: existing.id },
    data: {
      expiresAt: row.occurredAt,
      policyVersion: policy.policyVersion,
      metadata: {
        ...prior,
        explanationFacts: policy.explanationFacts,
        endedReason: policy.explanationFacts.endedReason ?? null,
      },
    },
  });
  return finish(tx, row.id, {
    outcome: "expired",
    notificationId: existing.id,
    recipientCount: 0,
    unresolved: [],
    note: null,
  });
}

async function resolveThread(
  tx: Prisma.TransactionClient,
  row: { id: string; facilityId: string; occurredAt: Date },
  parsed: ParsedNotificationPayload,
  policy: Extract<AttentionPolicyResult, { outcome: "resolve" }>,
): Promise<NotificationProcessingResult> {
  if (
    parsed.kind !== "coverage" &&
    parsed.kind !== "key_point" &&
    parsed.kind !== "work_order_overdue_end" &&
    parsed.kind !== "work_order_intervention_end" &&
    parsed.kind !== "asset_outage_end"
  ) {
    return finish(tx, row.id, {
      outcome: "unsupported",
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: outboxEvaluationNote("unsupported", "resolve_without_coverage_thread"),
    });
  }
  const existing = await tx.notification.findUnique({
    where: { facilityId_dedupeKey: { facilityId: row.facilityId, dedupeKey: parsed.threadKey } },
    select: { id: true, resolvedAt: true, metadata: true },
  });
  if (!existing) {
    return finish(tx, row.id, {
      outcome: "resolve_noop",
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: null,
    });
  }
  if (!existing.resolvedAt) {
    const prior =
      existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? existing.metadata
        : {};
    await tx.notification.update({
      where: { id: existing.id },
      data: {
        resolvedAt: row.occurredAt,
        policyVersion: policy.policyVersion,
        metadata: {
          ...prior,
          explanationFacts: policy.explanationFacts,
          resolvedBy: policy.explanationFacts.eventType,
        },
      },
    });
  }
  return finish(tx, row.id, {
    outcome: "resolved",
    notificationId: existing.id,
    recipientCount: 0,
    unresolved: [],
    note: null,
  });
}

async function notifyThread(
  tx: Prisma.TransactionClient,
  row: {
    id: string;
    facilityId: string;
    departmentId: string | null;
    occurredAt: Date;
  },
  parsed: ParsedNotificationPayload,
  policy: Extract<AttentionPolicyResult, { outcome: "notify" }>,
): Promise<NotificationProcessingResult> {
  if (
    parsed.kind !== "coverage" &&
    parsed.kind !== "assignment" &&
    parsed.kind !== "publication" &&
    parsed.kind !== "key_point" &&
    parsed.kind !== "work_order" &&
    parsed.kind !== "work_order_overdue" &&
    parsed.kind !== "evidence_failed" &&
    parsed.kind !== "issue_created" &&
    parsed.kind !== "asset_out_of_service" &&
    parsed.kind !== "work_order_intervention"
  ) {
    return finish(tx, row.id, {
      outcome: "deferred",
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: outboxEvaluationNote("deferred", "thread_identity_not_certified"),
    });
  }
  if (policy.namedSourceUserId) {
    return finish(tx, row.id, {
      outcome: "deferred",
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: outboxEvaluationNote("deferred", "sync_named_user_not_persistable"),
    });
  }
  if (policy.audience === "floor" && !row.departmentId) {
    return finish(tx, row.id, {
      outcome: "deferred",
      notificationId: null,
      recipientCount: 0,
      unresolved: [],
      note: outboxEvaluationNote("deferred", "department_required"),
    });
  }

  const presentation =
    parsed.kind === "coverage"
      ? coveragePresentation(parsed.display, parsed.thread.serviceDate)
      : parsed.kind === "assignment"
        ? assignmentPresentation(parsed.subjectLabel)
        : parsed.kind === "key_point"
          ? keyPointPresentation(parsed)
          : parsed.kind === "work_order"
            ? workOrderAssignmentPresentation({
                repairId: parsed.thread.repairId,
                locationLabel: parsed.locationLabel,
                subjectLabel: parsed.subjectLabel,
              })
              : parsed.kind === "work_order_overdue"
              ? workOrderOverduePresentation({
                  repairId: parsed.thread.repairId,
                  locationLabel: parsed.locationLabel,
                  subjectLabel: parsed.subjectLabel,
                })
              : parsed.kind === "work_order_intervention"
                ? workOrderInterventionPresentation({
                    repairId: parsed.thread.repairId,
                    locationLabel: parsed.locationLabel,
                    subjectLabel: parsed.subjectLabel,
                  })
              : parsed.kind === "evidence_failed"
                ? evidenceFailedPresentation({
                    recordId: parsed.thread.recordId,
                    locationLabel: parsed.locationLabel,
                    subjectLabel: parsed.subjectLabel,
                  })
                : parsed.kind === "issue_created"
                  ? issueCreatedPresentation({
                      issueId: parsed.thread.issueId,
                      locationLabel: parsed.locationLabel,
                      subjectLabel: parsed.subjectLabel,
                    })
                  : parsed.kind === "asset_out_of_service"
                    ? assetOutOfServicePresentation({
                        assetId: parsed.thread.assetId,
                        locationLabel: parsed.locationLabel,
                        subjectLabel: parsed.subjectLabel,
                      })
                    : publicationPresentation(parsed.subjectLabel);

  const resolution = await resolveNotificationRecipients(tx, {
    facilityId: row.facilityId,
    departmentId: row.departmentId,
    audience: policy.audience,
    reasons: policy.recipientReasons,
    assigneeEmployeeId:
      parsed.kind === "assignment" || parsed.kind === "work_order" || parsed.kind === "work_order_overdue"
        ? parsed.assigneeEmployeeId
        : null,
    repairId:
      parsed.kind === "work_order" || parsed.kind === "work_order_overdue" ? parsed.thread.repairId : null,
    onDuty:
      parsed.kind === "assignment"
        ? {
            serviceDate: parsed.serviceDate,
            at: row.occurredAt,
            unitId: parsed.unitId,
            spaceId: parsed.spaceId,
          }
        : parsed.kind === "coverage" || parsed.kind === "key_point"
          ? {
              serviceDate: parsed.thread.serviceDate,
              at: row.occurredAt,
              spaceId: parsed.thread.spaceId,
            }
          : parsed.kind === "evidence_failed" || parsed.kind === "issue_created"
            ? {
                serviceDate: parsed.operationalDate,
                at: row.occurredAt,
                unitId: parsed.unitId,
                spaceId: parsed.spaceId,
              }
            : null,
    onCall:
      parsed.kind === "asset_out_of_service" || parsed.kind === "work_order_intervention"
        ? { at: row.occurredAt, unitId: parsed.unitId, spaceId: parsed.spaceId }
        : null,
  });
  const unresolved = unresolvedFacts(resolution.unresolved);
  const write: ThreadWrite = {
    kind: policy.kind,
    category: policy.category,
    priority: policy.priority,
    requiresAcknowledgement: policy.requiresAcknowledgement,
    title: presentation.title,
    body: presentation.body,
    actionPath: presentation.actionPath,
    sourceType:
      parsed.kind === "coverage"
        ? "coverage_responsibility"
        : parsed.kind === "assignment"
          ? "assignment_change"
          : parsed.kind === "key_point"
            ? "key_point_occurrence"
            : parsed.kind === "work_order"
              ? "work_order_assignment"
              : parsed.kind === "work_order_overdue"
                ? "work_order_overdue"
                : parsed.kind === "work_order_intervention"
                  ? "work_order_response"
                  : parsed.kind === "evidence_failed"
                  ? "evidence_record"
                  : parsed.kind === "issue_created"
                    ? "issue"
                    : parsed.kind === "asset_out_of_service"
                      ? "asset_status"
                      : "publication_attempt",
    sourceId: parsed.threadKey,
    policyVersion: policy.policyVersion,
    metadata: {
      explanationFacts: policy.explanationFacts,
      protected: policy.protected,
      responsibility: {
        primaryReason: policy.recipientReasons.length === 1 ? policy.recipientReasons[0] : null,
      },
      display:
        parsed.kind === "coverage"
          ? parsed.display
          : parsed.kind === "key_point"
            ? {
                locationLabel: parsed.locationLabel,
                keyPointLabel: parsed.keyPointLabel,
                expectedLocal: parsed.expectedLocal,
              }
            : { subjectLabel: parsed.subjectLabel },
      unresolvedRecipients: unresolved,
      ...(parsed.kind === "assignment"
        ? {
            assignmentId: parsed.thread.assignmentId,
            assignmentEventId: parsed.thread.assignmentEventId,
          }
        : {}),
      ...(parsed.kind === "work_order"
        ? {
            repairId: parsed.thread.repairId,
            assignmentEventId: parsed.thread.assignmentEventId,
          }
        : {}),
      ...(parsed.kind === "work_order_overdue"
        ? {
            repairId: parsed.thread.repairId,
          }
        : {}),
      ...(parsed.kind === "work_order_intervention"
        ? {
            repairId: parsed.thread.repairId,
            openingHistoryId: parsed.thread.openingHistoryId,
          }
        : {}),
      ...(parsed.kind === "evidence_failed"
        ? {
            recordId: parsed.thread.recordId,
          }
        : {}),
      ...(parsed.kind === "issue_created"
        ? {
            issueId: parsed.thread.issueId,
          }
        : {}),
      ...(parsed.kind === "asset_out_of_service"
        ? {
            assetId: parsed.thread.assetId,
            historyId: parsed.thread.historyId,
          }
        : {}),
    },
    escalationEligible: policy.response.escalationEligible,
  };

  const existing = await tx.notification.findUnique({
    where: { facilityId_dedupeKey: { facilityId: row.facilityId, dedupeKey: parsed.threadKey } },
    select: { id: true, priority: true, occurredAt: true, resolvedAt: true, expiresAt: true },
  });
  const reopenExpired =
    (parsed.kind === "key_point" || parsed.kind === "work_order_overdue") &&
    Boolean(existing?.expiresAt) &&
    !existing?.resolvedAt;
  if (existing?.resolvedAt) {
    return finish(tx, row.id, {
      outcome: "deferred",
      notificationId: existing.id,
      recipientCount: 0,
      unresolved,
      note: outboxEvaluationNote("deferred", "repeat_episode_not_defined"),
    });
  }
  if (existing && !reopenExpired && keepsCurrentPriority(existing.priority, policy.priority)) {
    if (parsed.kind === "assignment") {
      await settleAssignmentEpisodes(tx, {
        facilityId: row.facilityId,
        assignmentId: parsed.thread.assignmentId,
        threadKey: parsed.threadKey,
        notificationId: existing.id,
        occurredAt: row.occurredAt,
      });
    }
    if (parsed.kind === "work_order_overdue") {
      await replaceRecipients(tx, existing.id, resolution, policy.recipientReasons);
    }
    return finish(tx, row.id, {
      outcome: "priority_held",
      notificationId: existing.id,
      recipientCount: 0,
      unresolved,
      note: null,
    });
  }

  const notificationId = existing
    ? await updateOpenThread(tx, existing, row.occurredAt, write, reopenExpired)
    : await createThread(tx, row, parsed.threadKey, write);
  const opened = await tx.notification.findUnique({
    where: { id: notificationId },
    select: { resolvedAt: true },
  });
  if (opened?.resolvedAt) {
    return finish(tx, row.id, {
      outcome: "deferred",
      notificationId,
      recipientCount: 0,
      unresolved,
      note: outboxEvaluationNote("deferred", "repeat_episode_not_defined"),
    });
  }

  const recipientCount =
    parsed.kind === "work_order_overdue"
      ? await replaceRecipients(tx, notificationId, resolution, policy.recipientReasons)
      : await persistRecipients(tx, notificationId, resolution);
  if (parsed.kind === "assignment") {
    await settleAssignmentEpisodes(tx, {
      facilityId: row.facilityId,
      assignmentId: parsed.thread.assignmentId,
      threadKey: parsed.threadKey,
      notificationId,
      occurredAt: row.occurredAt,
    });
  }
  if (parsed.kind === "work_order") {
    await settleWorkOrderAssignment(tx, {
      facilityId: row.facilityId,
      repairId: parsed.thread.repairId,
      assigneeEmployeeId: parsed.assigneeEmployeeId,
      notificationId,
      occurredAt: row.occurredAt,
    });
  }
  return finish(tx, row.id, {
    outcome: "applied",
    notificationId,
    recipientCount,
    unresolved,
    note: null,
  });
}

function metadataRecord(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record: Record<string, Prisma.JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) record[key] = entry;
  }
  return record;
}

async function endWorkOrderAssignmentAttention(
  tx: Prisma.TransactionClient,
  input: {
    facilityId: string;
    repairId: string;
    occurredAt: Date;
    endedReason: "responsibility_ended";
    exceptNotificationId?: string | null;
  },
): Promise<number> {
  const rows = await tx.notification.findMany({
    where: {
      facilityId: input.facilityId,
      category: "work_order",
      resolvedAt: null,
      expiresAt: null,
      ...(input.exceptNotificationId ? { id: { not: input.exceptNotificationId } } : {}),
    },
    select: { id: true, metadata: true, sourceType: true },
  });
  let ended = 0;
  for (const row of rows) {
    if (row.sourceType !== "work_order_assignment") continue;
    const prior = metadataRecord(row.metadata);
    if (prior.repairId !== input.repairId) continue;
    await tx.notification.update({
      where: { id: row.id },
      data: {
        expiresAt: input.occurredAt,
        metadata: { ...prior, endedReason: input.endedReason },
      },
    });
    ended += 1;
  }
  return ended;
}

/**
 * A new assignment ends older assignment attention for the same Work Order.
 * That end is responsibility ending, not Work Order completion.
 * A late event for someone who is no longer the assignee is stored as Ended.
 */
async function settleWorkOrderAssignment(
  tx: Prisma.TransactionClient,
  input: {
    facilityId: string;
    repairId: string;
    assigneeEmployeeId: string;
    notificationId: string;
    occurredAt: Date;
  },
): Promise<void> {
  await endWorkOrderAssignmentAttention(tx, {
    facilityId: input.facilityId,
    repairId: input.repairId,
    occurredAt: input.occurredAt,
    endedReason: "responsibility_ended",
    exceptNotificationId: input.notificationId,
  });
  const repair = await tx.repair.findFirst({
    where: { id: input.repairId, unit: { facilityId: input.facilityId } },
    select: { assignedEmployeeId: true, status: true },
  });
  const stillAssigned =
    repair?.assignedEmployeeId === input.assigneeEmployeeId &&
    repair.status !== "COMPLETED" &&
    repair.status !== "CANCELLED";
  const newer = await tx.notification.findFirst({
    where: {
      facilityId: input.facilityId,
      category: "work_order",
      id: { not: input.notificationId },
      occurredAt: { gt: input.occurredAt },
      metadata: { path: ["repairId"], equals: input.repairId },
    },
    select: { id: true },
  });
  if (stillAssigned && !newer) return;
  const current = await tx.notification.findUnique({
    where: { id: input.notificationId },
    select: { metadata: true, resolvedAt: true, expiresAt: true },
  });
  if (!current || current.resolvedAt || current.expiresAt) return;
  const prior = metadataRecord(current.metadata);
  await tx.notification.update({
    where: { id: input.notificationId },
    data: {
      expiresAt: input.occurredAt,
      metadata: { ...prior, endedReason: "responsibility_ended" },
    },
  });
}

async function settleAssignmentEpisodes(
  tx: Prisma.TransactionClient,
  input: {
    facilityId: string;
    assignmentId: string;
    threadKey: string;
    notificationId: string;
    occurredAt: Date;
  },
): Promise<void> {
  const sameAssignment = {
    facilityId: input.facilityId,
    category: "assignment",
    resolvedAt: null,
    dedupeKey: { not: input.threadKey },
    metadata: { path: ["assignmentId"], equals: input.assignmentId },
  };
  await tx.notification.updateMany({
    where: { ...sameAssignment, occurredAt: { lt: input.occurredAt } },
    data: { resolvedAt: input.occurredAt },
  });
  const newer = await tx.notification.findFirst({
    where: { ...sameAssignment, occurredAt: { gt: input.occurredAt } },
    select: { occurredAt: true },
  });
  if (newer) {
    await tx.notification.update({
      where: { id: input.notificationId },
      data: { resolvedAt: newer.occurredAt },
    });
  }
}

async function updateOpenThread(
  tx: Prisma.TransactionClient,
  existing: { id: string; occurredAt: Date },
  occurredAt: Date,
  write: ThreadWrite,
  reopen = false,
): Promise<string> {
  const current = await tx.notification.findUnique({
    where: { id: existing.id },
    select: { createdAt: true, escalationDueAt: true, priority: true },
  });
  if (current && priorityRiseClearsSnooze(current.priority, write.priority)) {
    await tx.notificationRecipient.updateMany({
      where: { notificationId: existing.id },
      data: { snoozedUntil: null },
    });
  }
  const timing =
    write.escalationEligible && current && !current.escalationDueAt
      ? initialEscalationTiming(current.createdAt)
      : null;
  const updated = await tx.notification.update({
    where: { id: existing.id },
    data: {
      priority: write.priority,
      requiresAcknowledgement: write.requiresAcknowledgement,
      title: write.title,
      body: write.body,
      actionPath: write.actionPath,
      metadata: write.metadata,
      policyVersion: write.policyVersion,
      occurredAt: occurredAt > existing.occurredAt ? occurredAt : existing.occurredAt,
      ...(timing ?? {}),
      ...(reopen ? { expiresAt: null } : {}),
    },
    select: { id: true },
  });
  if (current && priorityRiseClearsSnooze(current.priority, write.priority)) {
    await enqueuePriorityRiseIfStrict(tx, {
      notificationId: existing.id,
      previous: current.priority,
      next: write.priority,
      now: new Date(),
    });
  }
  return updated.id;
}

async function createThread(
  tx: Prisma.TransactionClient,
  row: { facilityId: string; departmentId: string | null; occurredAt: Date },
  threadKey: string,
  write: ThreadWrite,
): Promise<string> {
  await tx.$executeRawUnsafe("SAVEPOINT notification_thread");
  try {
    const created = await tx.notification.create({
      data: {
        facilityId: row.facilityId,
        departmentId: row.departmentId,
        kind: write.kind,
        category: write.category,
        priority: write.priority,
        sourceType: write.sourceType,
        sourceId: write.sourceId,
        title: write.title,
        body: write.body,
        actionPath: write.actionPath,
        groupKey: null,
        dedupeKey: threadKey,
        requiresAcknowledgement: write.requiresAcknowledgement,
        occurredAt: row.occurredAt,
        policyVersion: write.policyVersion,
        metadata: write.metadata,
      },
      select: { id: true, createdAt: true },
    });
    if (write.escalationEligible) {
      await tx.notification.update({
        where: { id: created.id },
        data: initialEscalationTiming(created.createdAt),
      });
    }
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT notification_thread");
    return created.id;
  } catch (error) {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT notification_thread");
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const winner = await tx.notification.findUnique({
      where: { facilityId_dedupeKey: { facilityId: row.facilityId, dedupeKey: threadKey } },
      select: { id: true, occurredAt: true, resolvedAt: true, priority: true },
    });
    if (!winner) throw error;
    if (winner.resolvedAt) return winner.id;
    if (keepsCurrentPriority(winner.priority, write.priority)) return winner.id;
    return updateOpenThread(tx, winner, row.occurredAt, write);
  }
}

async function replaceRecipients(
  tx: Prisma.TransactionClient,
  notificationId: string,
  resolution: RecipientResolution,
  ownedReasons: readonly RecipientResolution["resolved"][number]["reason"][],
): Promise<number> {
  const owned = new Set(ownedReasons);
  const next = new Set(resolution.resolved.map((recipient) => `${recipient.userId}:${recipient.reason}`));
  const existing = await tx.notificationRecipient.findMany({
    where: { notificationId },
    select: { id: true, userId: true, reason: true },
  });
  const removeIds = existing
    .filter((recipient) => owned.has(recipient.reason) && !next.has(`${recipient.userId}:${recipient.reason}`))
    .map((recipient) => recipient.id);
  if (removeIds.length > 0) {
    await tx.notificationDelivery.deleteMany({ where: { notificationRecipientId: { in: removeIds } } });
    await tx.notificationRecipient.deleteMany({ where: { id: { in: removeIds } } });
  }
  return persistRecipients(tx, notificationId, resolution);
}

async function persistRecipients(
  tx: Prisma.TransactionClient,
  notificationId: string,
  resolution: RecipientResolution,
): Promise<number> {
  let count = 0;
  for (const recipient of resolution.resolved) {
    const prior = await tx.notificationRecipient.findUnique({
      where: {
        notificationId_userId_reason: {
          notificationId,
          userId: recipient.userId,
          reason: recipient.reason,
        },
      },
      select: { id: true },
    });
    const row = await tx.notificationRecipient.upsert({
      where: {
        notificationId_userId_reason: {
          notificationId,
          userId: recipient.userId,
          reason: recipient.reason,
        },
      },
      create: {
        notificationId,
        userId: recipient.userId,
        reason: recipient.reason,
        explanation: recipient.explanation,
      },
      update: { explanation: recipient.explanation },
      select: { id: true },
    });
    await tx.notificationDelivery.upsert({
      where: {
        notificationRecipientId_channel: {
          notificationRecipientId: row.id,
          channel: NotificationDeliveryChannel.IN_APP,
        },
      },
      create: {
        notificationRecipientId: row.id,
        channel: NotificationDeliveryChannel.IN_APP,
        status: NotificationDeliveryStatus.DELIVERED,
        attemptCount: 1,
        deliveredAt: new Date(),
        sentAt: new Date(),
      },
      update: { status: NotificationDeliveryStatus.DELIVERED },
    });
    if (!prior) await enqueuePushForNewRecipient(tx, { recipientId: row.id, now: new Date() });
    count += 1;
  }
  return count;
}

async function finish(
  tx: Prisma.TransactionClient,
  outboxId: string,
  result: Omit<NotificationProcessingResult, "outboxId">,
): Promise<NotificationProcessingResult> {
  await tx.notificationOutbox.update({
    where: { id: outboxId },
    data: {
      attemptCount: { increment: 1 },
      processedAt: new Date(),
      lastError: result.note,
    },
  });
  return { outboxId, ...result };
}
