/**
 * Active responsibility reconciliation.
 *
 * Adds the people who hold the thread's primary responsibility at the
 * evaluator's now. It does not remove prior recipients, change priority,
 * or add the Department head.
 */

import {
  NotificationDeliveryChannel,
  NotificationDeliveryStatus,
  NotificationKind,
  NotificationPriority,
  NotificationRecipientReason,
  type Prisma,
} from "@prisma/client";

import { SCHEDULED_EVALUATION_FACILITY_BATCH } from "@/lib/scheduled-evaluation/cadence";
import {
  forFacilityRotation,
  readEvaluationCheckpoint,
  writeEvaluationCheckpoint,
} from "@/lib/scheduled-evaluation/continuation";
import type { ScheduledEvaluationDb, ScheduledEvaluationResult } from "@/lib/scheduled-evaluation/types";

import { enqueuePushForNewRecipient } from "./push-dispatch";
import { runPushDeliveryAfterCommit } from "./push-delivery";
import { deriveResponsePolicy, type AttentionForResponse } from "./response-policy";
import { resolveNotificationRecipients } from "./recipient-resolver";
import { loadResponsibilityContext, readPrimaryResponsibilityReason } from "./responsibility-context";

export const RESPONSIBILITY_RECONCILIATION_PAGE = 100;
export const RESPONSIBILITY_RECONCILIATION_MAX_PAGES = 5;

const ACTIVE_PRIORITIES: NotificationPriority[] = [
  NotificationPriority.NEEDS_ATTENTION,
  NotificationPriority.URGENT,
  NotificationPriority.CRITICAL,
];

type OpenThread = {
  id: string;
  facilityId: string;
  departmentId: string | null;
  kind: NotificationKind;
  priority: NotificationPriority;
  requiresAcknowledgement: boolean;
  sourceType: string;
  sourceId: string;
  metadata: Prisma.JsonValue | null;
};

function emptyResult(): ScheduledEvaluationResult {
  return {
    facilitiesScanned: 0,
    candidates: 0,
    transitions: 0,
    reevaluations: 0,
    failures: 0,
    outboxIds: [],
  };
}

function attentionFor(thread: OpenThread): AttentionForResponse | "skip" | "fail" {
  const metadata =
    thread.metadata && typeof thread.metadata === "object" && !Array.isArray(thread.metadata)
      ? thread.metadata
      : null;
  const primary = readPrimaryResponsibilityReason(thread.metadata);
  if (!primary) return "skip";
  const protectedAttention = metadata?.protected;
  if (typeof protectedAttention !== "boolean") return "fail";
  return {
    kind: thread.kind,
    priority: thread.priority,
    requiresAcknowledgement: thread.requiresAcknowledgement,
    protected: protectedAttention,
    recipientReasons: [primary],
  };
}

async function addCurrentHolders(
  db: ScheduledEvaluationDb,
  thread: OpenThread,
  now: Date,
): Promise<"added" | "unchanged" | "skipped" | "failed"> {
  const attention = attentionFor(thread);
  if (attention === "skip") return "skipped";
  if (attention === "fail") return "failed";
  const response = deriveResponsePolicy(attention);
  if (!response.responsibilityReconciliationEligible || !response.primaryResponsibilityReason) return "skipped";
  const primary = response.primaryResponsibilityReason;
  if (
    primary !== NotificationRecipientReason.ON_DUTY_SUPERVISOR &&
    primary !== NotificationRecipientReason.ON_CALL_RESPONDER
  ) {
    return "skipped";
  }

  const outcome = await db.$transaction(async (tx) => {
    const current = await tx.notification.findFirst({
      where: { id: thread.id, resolvedAt: null, expiresAt: null },
      select: {
        id: true,
        facilityId: true,
        departmentId: true,
        kind: true,
        priority: true,
        requiresAcknowledgement: true,
        sourceType: true,
        sourceId: true,
        metadata: true,
      },
    });
    if (!current) return "skipped";
    const loaded = await loadResponsibilityContext(tx, current);
    if (!loaded.ok || loaded.context.primaryReason !== primary) return "failed";
    const context = loaded.context;
    if (primary === NotificationRecipientReason.ON_DUTY_SUPERVISOR && !context.serviceDate) return "failed";

    const resolution = await resolveNotificationRecipients(tx, {
      facilityId: context.facilityId,
      departmentId: context.departmentId,
      audience: "floor",
      reasons: [primary],
      onDuty:
        primary === NotificationRecipientReason.ON_DUTY_SUPERVISOR
          ? {
              serviceDate: context.serviceDate ?? "",
              at: now,
              unitId: context.unitId,
              spaceId: context.spaceId,
            }
          : null,
      onCall:
        primary === NotificationRecipientReason.ON_CALL_RESPONDER
          ? { at: now, unitId: context.unitId, spaceId: context.spaceId }
          : null,
    });
    const existing = await tx.notificationRecipient.findMany({
      where: { notificationId: current.id, reason: primary },
      select: { userId: true },
    });
    const present = new Set(existing.map((row) => row.userId));
    let added = 0;
    for (const recipient of resolution.resolved) {
      if (recipient.reason !== primary || present.has(recipient.userId)) continue;
      const row = await tx.notificationRecipient.create({
        data: {
          notificationId: current.id,
          userId: recipient.userId,
          reason: primary,
          explanation: recipient.explanation,
        },
        select: { id: true },
      });
      await tx.notificationDelivery.create({
        data: {
          notificationRecipientId: row.id,
          channel: NotificationDeliveryChannel.IN_APP,
          status: NotificationDeliveryStatus.DELIVERED,
          attemptCount: 1,
          sentAt: now,
          deliveredAt: now,
        },
      });
      await enqueuePushForNewRecipient(tx, { recipientId: row.id, now });
      present.add(recipient.userId);
      added += 1;
    }
    return added > 0 ? "added" : "unchanged";
  });
  if (outcome === "added") await runPushDeliveryAfterCommit(db, now);
  return outcome;
}

async function scanFacility(
  db: ScheduledEvaluationDb,
  facilityId: string,
  now: Date,
  startAfter: string | null,
): Promise<Pick<ScheduledEvaluationResult, "candidates" | "transitions" | "failures"> & { lastId: string | null; full: boolean }> {
  const totals = { candidates: 0, transitions: 0, failures: 0, lastId: startAfter, full: false };
  let cursor: string | undefined = startAfter ?? undefined;
  for (let page = 0; page < RESPONSIBILITY_RECONCILIATION_MAX_PAGES; page += 1) {
    const threads = await db.notification.findMany({
      where: {
        facilityId,
        resolvedAt: null,
        expiresAt: null,
        kind: NotificationKind.OPERATIONAL,
        priority: { in: ACTIVE_PRIORITIES },
      },
      orderBy: { id: "asc" },
      take: RESPONSIBILITY_RECONCILIATION_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        facilityId: true,
        departmentId: true,
        kind: true,
        priority: true,
        requiresAcknowledgement: true,
        sourceType: true,
        sourceId: true,
        metadata: true,
      },
    });
    if (threads.length === 0) break;
    totals.lastId = threads[threads.length - 1]?.id ?? totals.lastId;
    for (const thread of threads) {
      const attention = attentionFor(thread);
      if (attention === "skip") continue;
      if (attention === "fail") {
        totals.failures += 1;
        continue;
      }
      let response;
      try {
        response = deriveResponsePolicy(attention);
      } catch {
        totals.failures += 1;
        continue;
      }
      if (!response.responsibilityReconciliationEligible) continue;
      totals.candidates += 1;
      try {
        const outcome = await addCurrentHolders(db, thread, now);
        if (outcome === "added") totals.transitions += 1;
        if (outcome === "failed") totals.failures += 1;
      } catch {
        totals.failures += 1;
      }
    }
    cursor = threads[threads.length - 1]?.id;
    if (threads.length < RESPONSIBILITY_RECONCILIATION_PAGE) break;
    if (page === RESPONSIBILITY_RECONCILIATION_MAX_PAGES - 1) totals.full = true;
  }
  return totals;
}

export async function evaluateResponsibilityReconciliation(input: {
  db: ScheduledEvaluationDb;
  now: Date;
  facilityIds?: string[];
  control?: { deadline: Date; owner?: string; renew: () => Promise<boolean> };
}): Promise<ScheduledEvaluationResult> {
  const result = emptyResult();
  const checkpoint = input.facilityIds
    ? { facilityCursor: null, recordCursor: null, recordFacilityId: null }
    : await readEvaluationCheckpoint(input.db, "notifications.responsibility-reconciliation");
  const discovered = await input.db.notification.findMany({
    where: {
      resolvedAt: null,
      expiresAt: null,
      kind: NotificationKind.OPERATIONAL,
      priority: { in: ACTIVE_PRIORITIES },
      ...(input.facilityIds ? { facilityId: { in: input.facilityIds } } : {}),
    },
    distinct: ["facilityId"],
    select: { facilityId: true },
    orderBy: { facilityId: "asc" },
  });
  const ordered = [...new Set(discovered.map((row) => row.facilityId))].sort();
  const rotation = await forFacilityRotation({
    orderedIds: ordered,
    checkpoint,
    batchSize: SCHEDULED_EVALUATION_FACILITY_BATCH,
    oneList: Boolean(input.facilityIds),
    control: input.control,
    visit: async (facilityId, afterId) => {
      try {
        const scanned = await scanFacility(input.db, facilityId, input.now, afterId);
        if (!afterId) result.facilitiesScanned += 1;
        result.candidates += scanned.candidates;
        result.transitions += scanned.transitions;
        result.failures += scanned.failures;
        return { full: scanned.full, lastId: scanned.lastId };
      } catch {
        result.failures += 1;
        result.facilitiesScanned += 1;
        return { full: false, lastId: null };
      }
    },
  });
  result.cycleCompleted = input.facilityIds ? true : rotation.cycleCompleted;
  if (!input.facilityIds) {
    await writeEvaluationCheckpoint(input.db, "notifications.responsibility-reconciliation", rotation.checkpoint, {
      owner: input.control?.owner,
      cycleCompleted: rotation.cycleCompleted,
      now: input.now,
    });
  }
  return result;
}

/** A recipient row counts as current primary duty only when its reason is the thread's primary reason. */
export function userHoldsPrimaryReason(
  rows: readonly { userId: string; reason: NotificationRecipientReason }[],
  userId: string,
  primary: NotificationRecipientReason,
): boolean {
  return rows.some((row) => row.userId === userId && row.reason === primary);
}
