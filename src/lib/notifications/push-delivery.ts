/**
 * Post-commit Web Push pass.
 *
 * Claim is a database update. Two workers cannot both send one dispatch.
 * A crash after the push service accepts the message and before this row
 * is marked sent can send once more. The browser tag is the Notification id,
 * and a retry does not set renotify. The request timeout is shorter than
 * the claim lease, so a second worker does not reclaim a request that is
 * still running. A crash after acceptance and before SENT remains at-least-once.
 */
import { Prisma, type PrismaClient } from "@prisma/client";

import { userHasActiveFacilityAccess } from "@/lib/facility-access/assert-user-facility-access";

import { pushAuthorizationErrorCode, pushSendAuthorization } from "./push-authorization";
import { loadPushOpportunityDecision } from "./push-dispatch";
import { classifyPushEndpointUrl } from "./push-endpoint";
import { revokePushSubscriptionReason } from "./push-subscription";
import {
  browserPushPayload,
  sendWebPush,
  type PushSendInput,
  type PushSendResult,
} from "./push-sender";
import { isWebPushSendingEnabled, vapidPrivateKeyIsConfigured, vapidSubjectIsConfigured, readVapidPublicKey } from "./web-push-config";

/** Immediate attempt plus two scheduled retries. A five-minute clock cannot finish a fourth attempt inside the fifteen-minute TTL. */
export const PUSH_MAX_ATTEMPTS = 3;

/**
 * Minimum delay before the next attempt is eligible.
 * The five-minute clock may wait longer. It must not send after `expiresAt`.
 */
export function pushRetryEligibility(input: {
  attemptCount: number;
  now: Date;
  expiresAt: Date;
}): { action: "retry"; notBefore: Date } | { action: "stop"; reason: "attempts" | "expired" } {
  const delay = Math.min(60_000, 15_000 * 2 ** Math.max(0, input.attemptCount - 1));
  const notBefore = new Date(input.now.getTime() + delay);
  if (input.attemptCount >= PUSH_MAX_ATTEMPTS) return { action: "stop", reason: "attempts" };
  if (notBefore.getTime() >= input.expiresAt.getTime() || input.now.getTime() >= input.expiresAt.getTime()) {
    return { action: "stop", reason: "expired" };
  }
  return { action: "retry", notBefore };
}
export const PUSH_CLAIM_LEASE_MS = 20_000;
export const PUSH_TTL_SECONDS = 15 * 60;

export type PushTransport = (input: PushSendInput) => Promise<PushSendResult>;

export type PushDeliverySummary = {
  claimed: number;
  sent: number;
  suppressed: number;
  failed: number;
  expired: number;
  stopped: "flag" | "configuration" | null;
};

export async function runPushDeliveryAfterCommit(db: PrismaClient, now = new Date()): Promise<void> {
  await deliverQueuedPushDispatches(db, { now, limit: 10 }).catch(() => undefined);
}

export async function deliverQueuedPushDispatches(
  db: PrismaClient,
  input: { now?: Date; limit?: number; transport?: PushTransport; beforeSend?: () => Promise<void> } = {},
): Promise<PushDeliverySummary> {
  const now = input.now ?? new Date();
  const summary: PushDeliverySummary = {
    claimed: 0,
    sent: 0,
    suppressed: 0,
    failed: 0,
    expired: 0,
    stopped: null,
  };
  summary.expired = await expirePushDispatches(db, now);
  if (!isWebPushSendingEnabled()) {
    summary.stopped = "flag";
    return summary;
  }
  const transport = input.transport ?? (vapidReady() ? sendWebPush : null);
  if (!transport) {
    summary.stopped = "configuration";
    return summary;
  }
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const rows = await db.pushDispatch.findMany({
    where: claimWhere(now),
    orderBy: [{ queuedAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true },
  });
  for (const row of rows) {
    const outcome = await deliverOne(db, row.id, now, transport, input.beforeSend);
    if (outcome === "skipped") continue;
    summary.claimed += 1;
    if (outcome === "sent") summary.sent += 1;
    if (outcome === "suppressed") summary.suppressed += 1;
    if (outcome === "failed" || outcome === "expired") summary.failed += 1;
    if (outcome === "configuration") {
      summary.stopped = "configuration";
      break;
    }
  }
  return summary;
}

async function deliverOne(
  db: PrismaClient,
  id: string,
  now: Date,
  transport: PushTransport,
  beforeSend?: () => Promise<void>,
): Promise<"skipped" | "sent" | "suppressed" | "failed" | "expired" | "configuration"> {
  if (!isWebPushSendingEnabled()) return "configuration";
  const claimed = await db.pushDispatch.updateMany({
    where: { id, ...claimWhere(now) },
    data: {
      status: "SENDING",
      claimedUntil: new Date(now.getTime() + PUSH_CLAIM_LEASE_MS),
      lastAttemptAt: now,
      attemptCount: { increment: 1 },
    },
  });
  if (claimed.count !== 1) return "skipped";

  try {
    const row = await db.pushDispatch.findUnique({
      where: { id },
      select: {
        id: true,
        triggerKey: true,
        attemptCount: true,
        expiresAt: true,
        notificationRecipientId: true,
        pushSubscription: {
          select: {
            id: true,
            userId: true,
            endpoint: true,
            p256dh: true,
            auth: true,
            revokedAt: true,
            authorizedUntil: true,
            user: { select: { isActive: true } },
          },
        },
        notificationRecipient: {
          select: {
            id: true,
            userId: true,
            notification: { select: { id: true, facilityId: true, resolvedAt: true, expiresAt: true } },
          },
        },
      },
    });
    if (!row) {
      await db.pushDispatch.update({
        where: { id },
        data: { status: "FAILED", claimedUntil: null, lastErrorCode: "missing" },
      });
      return "skipped";
    }
    if (row.expiresAt.getTime() <= now.getTime()) {
      await finish(db, id, { status: "FAILED", lastErrorCode: "expired" });
      return "expired";
    }

    const recipient = row.notificationRecipient;
    const subscription = row.pushSubscription;
    if (!recipient) {
      await finish(db, id, { status: "SUPPRESSED", lastErrorCode: "recipient_removed" });
      return "suppressed";
    }
    const notification = recipient.notification;
    if (notification.resolvedAt || (notification.expiresAt && notification.expiresAt.getTime() <= now.getTime())) {
      await finish(db, id, { status: "SUPPRESSED", lastErrorCode: "thread_closed" });
      return "suppressed";
    }
    if (subscription.userId !== recipient.userId) {
      await finish(db, id, { status: "SUPPRESSED", lastErrorCode: "subscription_rebound" });
      return "suppressed";
    }
    if (!(await userHasActiveFacilityAccess(db, recipient.userId, notification.facilityId))) {
      await finish(db, id, { status: "SUPPRESSED", lastErrorCode: "facility_access" });
      return "suppressed";
    }
    if (classifyPushEndpointUrl(subscription.endpoint) !== "ok") {
      await revokePushSubscriptionReason(db, {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        reason: "UNAUTHORIZED",
        now,
      });
      await finish(db, id, { status: "FAILED", lastErrorCode: "unsafe_endpoint" });
      return "failed";
    }
    const decision = await loadPushOpportunityDecision(db, { recipientId: recipient.id, now });
    if (decision !== "eligible") {
      await finish(db, id, { status: "SUPPRESSED", lastErrorCode: decision === "missing" ? "recipient_removed" : decision });
      return "suppressed";
    }
    if (beforeSend) await beforeSend();
    if (await suppressUnauthorized(db, subscription.id, id, now)) return "suppressed";

    let result: PushSendResult;
    try {
      result = await transport({
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        ttlSeconds: remainingTtlSeconds(row.expiresAt, now),
        payload: browserPushPayload(notification.id, row.triggerKey, row.attemptCount),
      });
    } catch {
      result = { outcome: "temporary", code: "transport" };
    }

    if (result.outcome === "accepted") {
      await finish(db, id, { status: "SENT", sentAt: now, lastErrorCode: null });
      return "sent";
    }
    if (result.outcome === "gone") {
      await revokePushSubscriptionReason(db, {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        reason: "GONE",
        now,
      });
      await finish(db, id, { status: "FAILED", lastErrorCode: "gone" });
      return "failed";
    }
    if (result.outcome === "unsafe") {
      await revokePushSubscriptionReason(db, {
        subscriptionId: subscription.id,
        userId: subscription.userId,
        reason: "UNAUTHORIZED",
        now,
      });
      await finish(db, id, { status: "FAILED", lastErrorCode: "unsafe_endpoint" });
      return "failed";
    }
    if (result.outcome === "invalid") {
      await finish(db, id, { status: "FAILED", lastErrorCode: "invalid" });
      return "failed";
    }
    if (result.outcome === "configuration") {
      await db.pushDispatch.update({
        where: { id },
        data: {
          status: "QUEUED",
          attemptCount: Math.max(0, row.attemptCount - 1),
          claimedUntil: new Date(now.getTime() + 60_000),
          lastErrorCode: "configuration",
        },
      });
      return "configuration";
    }
    const retried = await retryOrFail(db, id, row.attemptCount, row.expiresAt, now, "temporary");
    return retried === "requeued" ? "skipped" : retried;
  } catch {
    // Never leave a claimed SENDING row orphaned when delivery is interrupted under load.
    await db.pushDispatch
      .update({
        where: { id },
        data: { status: "QUEUED", claimedUntil: null, lastErrorCode: "delivery_interrupted" },
      })
      .catch(() => undefined);
    return "failed";
  }
}

async function suppressUnauthorized(
  db: PrismaClient,
  subscriptionId: string,
  dispatchId: string,
  now: Date,
): Promise<boolean> {
  const fresh = await db.pushSubscription.findUnique({
    where: { id: subscriptionId },
    select: { revokedAt: true, authorizedUntil: true, user: { select: { isActive: true } } },
  });
  const decision = pushSendAuthorization({
    revokedAt: fresh?.revokedAt ?? null,
    authorizedUntil: fresh?.authorizedUntil ?? null,
    userActive: fresh?.user.isActive === true,
    now,
  });
  if (decision === "allowed") return false;
  await finish(db, dispatchId, { status: "SUPPRESSED", lastErrorCode: pushAuthorizationErrorCode(decision) });
  return true;
}

async function retryOrFail(
  db: PrismaClient,
  id: string,
  attemptCount: number,
  expiresAt: Date,
  now: Date,
  code: string,
): Promise<"failed" | "expired" | "requeued"> {
  const decision = pushRetryEligibility({ attemptCount, now, expiresAt });
  if (decision.action === "stop") {
    await finish(db, id, { status: "FAILED", lastErrorCode: decision.reason });
    return "failed";
  }
  await db.pushDispatch.update({
    where: { id },
    data: { status: "QUEUED", claimedUntil: decision.notBefore, lastErrorCode: code },
  });
  return "requeued";
}

function claimWhere(now: Date): Prisma.PushDispatchWhereInput {
  return {
    expiresAt: { gt: now },
    attemptCount: { lt: PUSH_MAX_ATTEMPTS },
    OR: [
      { status: "QUEUED", claimedUntil: null },
      { status: "QUEUED", claimedUntil: { lt: now } },
      { status: "SENDING", claimedUntil: { lt: now } },
    ],
  };
}

async function expirePushDispatches(db: PrismaClient, now: Date): Promise<number> {
  const expired = await db.pushDispatch.updateMany({
    where: { status: { in: ["QUEUED", "SENDING"] }, expiresAt: { lte: now } },
    data: { status: "FAILED", lastErrorCode: "expired", claimedUntil: null },
  });
  const exhausted = await db.pushDispatch.updateMany({
    where: { status: { in: ["QUEUED", "SENDING"] }, attemptCount: { gte: PUSH_MAX_ATTEMPTS } },
    data: { status: "FAILED", lastErrorCode: "attempts", claimedUntil: null },
  });
  return expired.count + exhausted.count;
}

async function finish(
  db: PrismaClient,
  id: string,
  data: { status: "SENT" | "FAILED" | "SUPPRESSED"; lastErrorCode: string | null; sentAt?: Date },
): Promise<void> {
  await db.pushDispatch.update({
    where: { id },
    data: { ...data, claimedUntil: null },
  });
}

function remainingTtlSeconds(expiresAt: Date, now: Date): number {
  return Math.max(1, Math.min(PUSH_TTL_SECONDS, Math.floor((expiresAt.getTime() - now.getTime()) / 1000)));
}

function vapidReady(): boolean {
  return Boolean(readVapidPublicKey()) && vapidPrivateKeyIsConfigured() && vapidSubjectIsConfigured();
}
