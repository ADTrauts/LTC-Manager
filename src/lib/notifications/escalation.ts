/**
 * V1 acknowledgement escalation.
 *
 * One tier: the Department head. The deadline is the thread's createdAt plus
 * one code-owned threshold. Priority, protected status, and the source stay.
 * escalatedAt means the Department head was added, not that the clock expired.
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
import { readPrimaryResponsibilityReason } from "./responsibility-context";

/**
 * No certified duration existed. Fifteen minutes is longer than the five-minute
 * evaluation cadence, so a thread is not escalated on the tick that opened it,
 * and shorter than a meal service, so an unacknowledged condition still reaches
 * the Department head during that service. Every priority uses this same window.
 * Coverage's 30-minute band remains a priority clock.
 */
export const ATTENTION_ESCALATION_DELAY_MS = 15 * 60 * 1000;

/** Frozen with the deadline. Attention policyVersion may change later. */
export const ESCALATION_POLICY_VERSION = "notifications-n4c-v1" as const;

export const ESCALATION_PAGE = 100;
export const ESCALATION_MAX_PAGES = 5;

export const ESCALATION_EXPLANATION =
  "You were added because this attention was not acknowledged within the response window.";

const ACTIVE_PRIORITIES: NotificationPriority[] = [
  NotificationPriority.NEEDS_ATTENTION,
  NotificationPriority.URGENT,
  NotificationPriority.CRITICAL,
];

export function escalationDeadline(createdAt: Date): Date {
  return new Date(createdAt.getTime() + ATTENTION_ESCALATION_DELAY_MS);
}

export function initialEscalationTiming(createdAt: Date): {
  escalationDueAt: Date;
  escalationPolicyVersion: typeof ESCALATION_POLICY_VERSION;
} {
  return {
    escalationDueAt: escalationDeadline(createdAt),
    escalationPolicyVersion: ESCALATION_POLICY_VERSION,
  };
}

export function primaryAcknowledgementExists(
  rows: readonly { reason: NotificationRecipientReason; acknowledgedAt: Date | null }[],
  primary: NotificationRecipientReason,
): boolean {
  return rows.some((row) => row.reason === primary && row.acknowledgedAt != null);
}

type DueThread = {
  id: string;
  facilityId: string;
  departmentId: string | null;
  kind: NotificationKind;
  priority: NotificationPriority;
  requiresAcknowledgement: boolean;
  metadata: Prisma.JsonValue | null;
  escalationDueAt: Date | null;
};

type EscalationOutcome =
  | "escalated"
  | "acknowledged"
  | "closed"
  | "ineligible"
  | "not_due"
  | "missing_primary"
  | "unresolved";

class EscalationLostRace extends Error {
  constructor() {
    super("escalation_lost_race");
    this.name = "EscalationLostRace";
  }
}

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

function attentionFor(thread: DueThread): AttentionForResponse | "missing_primary" | "invalid" {
  const metadata =
    thread.metadata && typeof thread.metadata === "object" && !Array.isArray(thread.metadata)
      ? thread.metadata
      : null;
  const primary = readPrimaryResponsibilityReason(thread.metadata);
  if (!primary) return "missing_primary";
  if (typeof metadata?.protected !== "boolean") return "invalid";
  return {
    kind: thread.kind,
    priority: thread.priority,
    requiresAcknowledgement: thread.requiresAcknowledgement,
    protected: metadata.protected,
    recipientReasons: [primary],
  };
}

export async function applyEscalationDecision(
  db: ScheduledEvaluationDb,
  thread: DueThread,
  now: Date,
): Promise<EscalationOutcome> {
  try {
    const outcome = await db.$transaction(async (tx) => {
      const current = await tx.notification.findFirst({
        where: { id: thread.id, resolvedAt: null, expiresAt: null, escalatedAt: null },
        select: {
          id: true,
          facilityId: true,
          departmentId: true,
          kind: true,
          priority: true,
          requiresAcknowledgement: true,
          metadata: true,
          escalationDueAt: true,
        },
      });
      if (!current) return "closed";
      if (!current.escalationDueAt || current.escalationDueAt.getTime() > now.getTime()) return "not_due";
      const attention = attentionFor(current);
      if (attention === "missing_primary") return "missing_primary";
      if (attention === "invalid") return "unresolved";
      const response = deriveResponsePolicy(attention);
      if (!response.escalationEligible || !response.primaryResponsibilityReason) return "ineligible";
      if (!current.departmentId) return "unresolved";
      const primary = response.primaryResponsibilityReason;
      const acknowledged = await tx.notificationRecipient.findFirst({
        where: { notificationId: current.id, reason: primary, acknowledgedAt: { not: null } },
        select: { id: true },
      });
      if (acknowledged) return "acknowledged";

      const resolution = await resolveNotificationRecipients(tx, {
        facilityId: current.facilityId,
        departmentId: current.departmentId,
        audience: "floor",
        reasons: [NotificationRecipientReason.DEPARTMENT_MANAGER],
      });
      const manager = resolution.resolved.find(
        (recipient) => recipient.reason === NotificationRecipientReason.DEPARTMENT_MANAGER,
      );
      if (!manager) return "unresolved";

      const present = await tx.notificationRecipient.findFirst({
        where: {
          notificationId: current.id,
          userId: manager.userId,
          reason: NotificationRecipientReason.DEPARTMENT_MANAGER,
        },
        select: { id: true },
      });
      if (!present) {
        const row = await tx.notificationRecipient.create({
          data: {
            notificationId: current.id,
            userId: manager.userId,
            reason: NotificationRecipientReason.DEPARTMENT_MANAGER,
            explanation: ESCALATION_EXPLANATION,
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
      }
      const stamped = await tx.notification.updateMany({
        where: { id: current.id, resolvedAt: null, expiresAt: null, escalatedAt: null },
        data: { escalatedAt: now },
      });
      if (stamped.count !== 1) throw new EscalationLostRace();
      return "escalated";
    });
    if (outcome === "escalated") await runPushDeliveryAfterCommit(db, now);
    return outcome;
  } catch (error) {
    if (error instanceof EscalationLostRace) return "closed";
    throw error;
  }
}

async function scanFacility(
  db: ScheduledEvaluationDb,
  facilityId: string,
  now: Date,
  startAfter: string | null,
): Promise<Pick<ScheduledEvaluationResult, "candidates" | "transitions" | "failures"> & { lastId: string | null; full: boolean }> {
  const totals = { candidates: 0, transitions: 0, failures: 0, lastId: startAfter, full: false };
  let cursor: string | undefined = startAfter ?? undefined;
  for (let page = 0; page < ESCALATION_MAX_PAGES; page += 1) {
    const threads = await db.notification.findMany({
      where: {
        facilityId,
        resolvedAt: null,
        expiresAt: null,
        escalatedAt: null,
        escalationDueAt: { lte: now },
        kind: NotificationKind.OPERATIONAL,
        requiresAcknowledgement: true,
        priority: { in: ACTIVE_PRIORITIES },
      },
      orderBy: { id: "asc" },
      take: ESCALATION_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        facilityId: true,
        departmentId: true,
        kind: true,
        priority: true,
        requiresAcknowledgement: true,
        metadata: true,
        escalationDueAt: true,
      },
    });
    if (threads.length === 0) break;
    totals.lastId = threads[threads.length - 1]?.id ?? totals.lastId;
    for (const thread of threads) {
      const attention = attentionFor(thread);
      if (attention === "missing_primary" || attention === "invalid") {
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
      if (!response.escalationEligible) continue;
      totals.candidates += 1;
      try {
        const outcome = await applyEscalationDecision(db, thread, now);
        if (outcome === "escalated") totals.transitions += 1;
        if (outcome === "unresolved" || outcome === "missing_primary") totals.failures += 1;
      } catch {
        totals.failures += 1;
      }
    }
    cursor = threads[threads.length - 1]?.id;
    if (threads.length < ESCALATION_PAGE) break;
    if (page === ESCALATION_MAX_PAGES - 1) totals.full = true;
  }
  return totals;
}

export async function evaluateAcknowledgementEscalation(input: {
  db: ScheduledEvaluationDb;
  now: Date;
  facilityIds?: string[];
  control?: { deadline: Date; owner?: string; renew: () => Promise<boolean> };
}): Promise<ScheduledEvaluationResult> {
  const result = emptyResult();
  const checkpoint = input.facilityIds
    ? { facilityCursor: null, recordCursor: null, recordFacilityId: null }
    : await readEvaluationCheckpoint(input.db, "notifications.escalation");
  const discovered = await input.db.notification.findMany({
    where: {
      resolvedAt: null,
      expiresAt: null,
      escalatedAt: null,
      escalationDueAt: { lte: input.now },
      kind: NotificationKind.OPERATIONAL,
      requiresAcknowledgement: true,
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
    await writeEvaluationCheckpoint(input.db, "notifications.escalation", rotation.checkpoint, {
      owner: input.control?.owner,
      cycleCompleted: rotation.cycleCompleted,
      now: input.now,
    });
  }
  return result;
}
