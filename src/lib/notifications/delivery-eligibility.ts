/**
 * Future external delivery eligibility.
 *
 * Interruptive delivery is push or another immediate channel. Digest is a
 * later batch of Updates. Neither decision hides the Notification Center
 * or changes the bell. N4D does not send either.
 */

import {
  NotificationKind,
  NotificationPriority,
  NotificationRecipientReason,
  type NotificationRecipientReason as RecipientReason,
} from "@prisma/client";

import type { NotificationDeliveryPreference } from "./notification-preference";
import { isInsideQuietWindow, isQuietMinute, localMinuteOfDay } from "./quiet-window";
import { deriveResponsePolicy, type AttentionForResponse } from "./response-policy";

export type DeliveryMode = "INTERRUPTIVE" | "DIGEST";

export type DeliveryDecision =
  | "eligible"
  | "thread_closed"
  | "snoozed"
  | "quiet"
  | "not_digest_eligible"
  | "digest_not_selected"
  | "policy_refused";

const OPERATIONAL_RESPONSIBILITY = new Set<RecipientReason>([
  NotificationRecipientReason.ON_DUTY_SUPERVISOR,
  NotificationRecipientReason.ON_CALL_RESPONDER,
]);

export function evaluateDeliveryEligibility(input: {
  notification: AttentionForResponse & {
    resolvedAt: Date | null;
    expiresAt: Date | null;
  };
  recipient: {
    reason: NotificationRecipientReason;
    snoozedUntil: Date | null;
  };
  preference: NotificationDeliveryPreference;
  now: Date;
  timeZone: string;
  mode: DeliveryMode;
  /**
   * Pass false only after Workforce says this User does not currently hold
   * on-duty or on-call responsibility. Omitted or true keeps quiet from
   * suppressing that responsibility.
   */
  currentlyHoldsOperationalResponsibility?: boolean;
}): DeliveryDecision {
  let policy;
  try {
    policy = deriveResponsePolicy(input.notification);
  } catch {
    return "policy_refused";
  }

  if (input.mode === "DIGEST") {
    if (input.notification.protected || !policy.digestEligible) return "not_digest_eligible";
    if (!input.preference.updateDigestEnabled) return "digest_not_selected";
    return "eligible";
  }

  if (!threadActive(input.notification, input.now)) return "thread_closed";
  if (input.notification.protected) return "eligible";
  if (input.recipient.snoozedUntil && input.recipient.snoozedUntil.getTime() > input.now.getTime()) return "snoozed";
  if (quietApplies(input, policy.quiet === "UPDATE_ONLY")) return "quiet";
  return "eligible";
}

function threadActive(
  notification: { resolvedAt: Date | null; expiresAt: Date | null },
  now: Date,
): boolean {
  if (notification.resolvedAt) return false;
  if (notification.expiresAt && notification.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

function quietApplies(
  input: {
    notification: { priority: NotificationPriority; kind: NotificationKind; protected: boolean };
    recipient: { reason: NotificationRecipientReason };
    preference: NotificationDeliveryPreference;
    now: Date;
    timeZone: string;
    currentlyHoldsOperationalResponsibility?: boolean;
  },
  updateOnly: boolean,
): boolean {
  if (!updateOnly || input.notification.priority !== NotificationPriority.UPDATE || input.notification.protected) {
    return false;
  }
  if (
    OPERATIONAL_RESPONSIBILITY.has(input.recipient.reason) &&
    input.currentlyHoldsOperationalResponsibility !== false
  ) {
    return false;
  }
  const start = input.preference.quietStartMinute;
  const end = input.preference.quietEndMinute;
  if (!input.preference.quietEnabled || !isQuietMinute(start) || !isQuietMinute(end)) return false;
  return isInsideQuietWindow(localMinuteOfDay(input.now, input.timeZone), start, end);
}
