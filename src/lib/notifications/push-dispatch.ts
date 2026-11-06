/**
 * Durable Web Push opportunities.
 *
 * A dispatch is one delivery to one subscription. It is not a Notification
 * and it is not the in-app NotificationDelivery row. Nothing is written
 * while WEB_PUSH_SENDING_ENABLED is not exactly true, so turning the flag
 * on cannot replay historical attention.
 *
 * Two recipient reasons for one User stay two rows. Each new row is its own
 * recipient-added trigger. The browser tag is the Notification id, so the
 * second alert replaces the first instead of stacking. Priority rise is a
 * separate trigger. Stored priority does not fall, so the priority key does
 * not need a second transition id.
 *
 * snooze-expired:{recipientId}:{snoozedUntil} names one exact snooze window.
 * A later window is a different key. A cleared window is not enqueued.
 */

import {
  NotificationKind,
  NotificationPriority,
  NotificationRecipientReason,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import { userHasActiveFacilityAccess } from "@/lib/facility-access/assert-user-facility-access";

import { evaluateDeliveryEligibility, type DeliveryDecision } from "./delivery-eligibility";
import { loadNotificationPreference } from "./notification-preference";
import { readPrimaryResponsibilityReason } from "./responsibility-context";
import { priorityRiseClearsSnooze, type AttentionForResponse } from "./response-policy";
import { holdsPrimaryNow } from "./snooze";
import { isWebPushSendingEnabled } from "./web-push-config";

type Db = PrismaClient | Prisma.TransactionClient;

export const PUSH_TTL_MS = 15 * 60 * 1000;

/** A snooze older than this is not a new browser interruption. */
export const SNOOZE_WAKE_HORIZON_MS = PUSH_TTL_MS;

export type PushOpportunityDecision = DeliveryDecision | "digest_selected" | "eligible";

export function recipientAddedTriggerKey(recipientId: string): string {
  return `recipient-added:${recipientId}`;
}

export function priorityRiseTriggerKey(recipientId: string, priority: NotificationPriority): string {
  return `priority:${recipientId}:${priority}`;
}

export function decidePushOpportunity(input: {
  notification: AttentionForResponse & {
    resolvedAt: Date | null;
    expiresAt: Date | null;
  };
  recipient: {
    reason: NotificationRecipientReason;
    snoozedUntil: Date | null;
  };
  preference: {
    quietEnabled: boolean;
    quietStartMinute: number | null;
    quietEndMinute: number | null;
    updateDigestEnabled: boolean;
  };
  now: Date;
  timeZone: string;
  currentlyHoldsOperationalResponsibility?: boolean;
}): PushOpportunityDecision {
  const shared = {
    notification: input.notification,
    recipient: input.recipient,
    preference: input.preference,
    now: input.now,
    timeZone: input.timeZone,
    ...(input.currentlyHoldsOperationalResponsibility === undefined
      ? {}
      : { currentlyHoldsOperationalResponsibility: input.currentlyHoldsOperationalResponsibility }),
  };
  const interruptive = evaluateDeliveryEligibility({ ...shared, mode: "INTERRUPTIVE" });
  if (interruptive !== "eligible") return interruptive;
  const digest = evaluateDeliveryEligibility({ ...shared, mode: "DIGEST" });
  if (digest === "eligible") return "digest_selected";
  return "eligible";
}

export async function enqueuePushForNewRecipient(
  db: Db,
  input: { recipientId: string; now: Date },
): Promise<void> {
  if (!isWebPushSendingEnabled()) return;
  const recipient = await loadRecipient(db, input.recipientId);
  if (!recipient) return;
  await writeOpportunities(db, [recipient], recipientAddedTriggerKey(recipient.id), input.now);
}

export async function enqueuePriorityRiseIfStrict(
  db: Db,
  input: {
    notificationId: string;
    previous: NotificationPriority;
    next: NotificationPriority;
    now: Date;
  },
): Promise<boolean> {
  if (!priorityRiseClearsSnooze(input.previous, input.next)) return false;
  if (!isWebPushSendingEnabled()) return true;
  const recipients = await db.notificationRecipient.findMany({
    where: { notificationId: input.notificationId },
    select: { id: true },
  });
  for (const recipient of recipients) {
    const loaded = await loadRecipient(db, recipient.id);
    if (!loaded) continue;
    await writeOpportunities(db, [loaded], priorityRiseTriggerKey(loaded.id, input.next), input.now);
  }
  return true;
}

export function snoozeExpiredTriggerKey(recipientId: string, snoozedUntil: Date): string {
  return `snooze-expired:${recipientId}:${snoozedUntil.toISOString()}`;
}

/**
 * One wake for the snooze window that is still stored on this recipient.
 * A cleared, replaced, closed, or ineligible window writes nothing.
 */
export async function enqueueSnoozeExpiryWake(
  db: Db,
  input: { recipientId: string; snoozedUntil: Date; now: Date },
): Promise<number> {
  if (!isWebPushSendingEnabled()) return 0;
  const recipient = await loadRecipient(db, input.recipientId);
  if (!recipient?.snoozedUntil) return 0;
  if (recipient.snoozedUntil.getTime() !== input.snoozedUntil.getTime()) return 0;
  if (recipient.snoozedUntil.getTime() > input.now.getTime()) return 0;
  if (input.now.getTime() - recipient.snoozedUntil.getTime() > SNOOZE_WAKE_HORIZON_MS) return 0;
  if (recipient.notification.resolvedAt) return 0;
  if (recipient.notification.expiresAt && recipient.notification.expiresAt.getTime() <= input.now.getTime()) return 0;
  if (!(await userHasActiveFacilityAccess(db, recipient.userId, recipient.notification.facilityId))) return 0;
  const decision = await decideForRecipient(db, recipient, input.now);
  if (decision !== "eligible") return 0;
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: recipient.userId, revokedAt: null },
    select: { id: true },
  });
  const triggerKey = snoozeExpiredTriggerKey(recipient.id, recipient.snoozedUntil);
  const expiresAt = new Date(input.now.getTime() + PUSH_TTL_MS);
  let created = 0;
  for (const subscription of subscriptions) {
    try {
      await db.pushDispatch.create({
        data: {
          notificationRecipientId: recipient.id,
          pushSubscriptionId: subscription.id,
          triggerKey,
          status: "QUEUED",
          queuedAt: input.now,
          expiresAt,
        },
      });
      created += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  return created;
}

export async function loadPushOpportunityDecision(
  db: Db,
  input: { recipientId: string; now: Date },
): Promise<PushOpportunityDecision | "missing"> {
  const recipient = await loadRecipient(db, input.recipientId);
  if (!recipient) return "missing";
  if (!(await userHasActiveFacilityAccess(db, recipient.userId, recipient.notification.facilityId))) {
    return "policy_refused";
  }
  return decideForRecipient(db, recipient, input.now);
}

async function writeOpportunities(
  db: Db,
  recipients: LoadedRecipient[],
  triggerKeyFor: string | ((recipientId: string) => string),
  now: Date,
): Promise<void> {
  for (const recipient of recipients) {
    const subscriptions = await db.pushSubscription.findMany({
      where: { userId: recipient.userId, revokedAt: null },
      select: { id: true },
    });
    if (subscriptions.length === 0) continue;
    const decision = await decideForRecipient(db, recipient, now);
    const triggerKey = typeof triggerKeyFor === "string" ? triggerKeyFor : triggerKeyFor(recipient.id);
    const expiresAt = new Date(now.getTime() + PUSH_TTL_MS);
    for (const subscription of subscriptions) {
      try {
        await db.pushDispatch.create({
          data: {
            notificationRecipientId: recipient.id,
            pushSubscriptionId: subscription.id,
            triggerKey,
            status: decision === "eligible" ? "QUEUED" : "SUPPRESSED",
            lastErrorCode: decision === "eligible" ? null : decision,
            queuedAt: now,
            expiresAt,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }
    }
  }
}

async function decideForRecipient(db: Db, recipient: LoadedRecipient, now: Date): Promise<PushOpportunityDecision> {
  const preference = await loadNotificationPreference(db, {
    userId: recipient.userId,
    facilityId: recipient.notification.facilityId,
  });
  const operational =
    recipient.reason === NotificationRecipientReason.ON_DUTY_SUPERVISOR ||
    recipient.reason === NotificationRecipientReason.ON_CALL_RESPONDER ||
    recipient.reason === NotificationRecipientReason.WORK_ORDER_ASSIGNEE;
  const holds = operational
    ? await holdsPrimaryNow(db, recipient.notification, recipient.userId, now)
    : null;
  const metadata = record(recipient.notification.metadata);
  const primary = readPrimaryResponsibilityReason(recipient.notification.metadata);
  const protectedAttention = typeof metadata?.protected === "boolean" ? metadata.protected : true;
  return decidePushOpportunity({
    notification: {
      kind: recipient.notification.kind,
      priority: recipient.notification.priority,
      requiresAcknowledgement: recipient.notification.requiresAcknowledgement,
      protected: protectedAttention,
      recipientReasons: primary ? [primary] : [recipient.reason],
      resolvedAt: recipient.notification.resolvedAt,
      expiresAt: recipient.notification.expiresAt,
    },
    recipient: { reason: recipient.reason, snoozedUntil: recipient.snoozedUntil },
    preference,
    now,
    timeZone: recipient.notification.facility.timezone,
    ...(holds === true || holds === false ? { currentlyHoldsOperationalResponsibility: holds } : {}),
  });
}

type LoadedRecipient = {
  id: string;
  userId: string;
  reason: NotificationRecipientReason;
  snoozedUntil: Date | null;
  notification: {
    id: string;
    facilityId: string;
    departmentId: string | null;
    kind: NotificationKind;
    priority: NotificationPriority;
    requiresAcknowledgement: boolean;
    sourceType: string;
    sourceId: string;
    metadata: Prisma.JsonValue | null;
    resolvedAt: Date | null;
    expiresAt: Date | null;
    facility: { timezone: string };
  };
};

async function loadRecipient(db: Db, recipientId: string): Promise<LoadedRecipient | null> {
  return db.notificationRecipient.findUnique({
    where: { id: recipientId },
    select: {
      id: true,
      userId: true,
      reason: true,
      snoozedUntil: true,
      notification: {
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
          resolvedAt: true,
          expiresAt: true,
          facility: { select: { timezone: true } },
        },
      },
    },
  });
}

function record(value: Prisma.JsonValue | null): Prisma.JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}
