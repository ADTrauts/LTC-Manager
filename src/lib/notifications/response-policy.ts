/**
 * N4A response policy.
 *
 * Attention Policy decides the attention a source condition creates.
 * Response Policy decides what the platform may do after that thread exists.
 * It does not choose priority, protected, acknowledgement, or recipient reasons,
 * and it does not read Coverage clocks, Work Order deadlines, or an Asset severity scale.
 *
 * N4B resolves ON_DUTY_SUPERVISOR and ON_CALL_RESPONDER at the evaluator's now.
 * It does not reuse Notification.createdAt or the opening event's occurredAt.
 * N4B also requires the thread to still be open. This module does not store that.
 * N4C reads escalation eligibility. N4D writes snooze. None of those run here.
 */

import {
  NotificationKind,
  NotificationPriority,
  NotificationRecipientReason,
} from "@prisma/client";

export const RESPONSIBILITY_RECONCILIATION_CLOCK = "evaluator_now" as const;

export const SNOOZE_POLICY = {
  NONE: "NONE",
  RECIPIENT_ALLOWED: "RECIPIENT_ALLOWED",
  NON_RESPONSIBLE_RECIPIENT_ONLY: "NON_RESPONSIBLE_RECIPIENT_ONLY",
} as const;

export type SnoozePolicy = (typeof SNOOZE_POLICY)[keyof typeof SNOOZE_POLICY];

export const QUIET_POLICY = {
  NONE: "NONE",
  UPDATE_ONLY: "UPDATE_ONLY",
} as const;

export type QuietPolicy = (typeof QUIET_POLICY)[keyof typeof QUIET_POLICY];

export type ResponsePolicy = {
  escalationEligible: boolean;
  /** True only when escalation is eligible. Acknowledgement then stops further expansion for the whole thread. */
  acknowledgementStopsExpansion: boolean;
  /**
   * The single initial recipient reason, when the thread has one.
   * N4C treats a recipient with this reason as a primary acknowledger.
   * More than one initial reason has no single primary.
   */
  primaryResponsibilityReason: NotificationRecipientReason | null;
  /**
   * N4B may add the current on-duty supervisor or on-call responder.
   * False for Updates, for a Work Order assignee, and when there is no single primary reason.
   * An open thread is still required at evaluation time.
   */
  responsibilityReconciliationEligible: boolean;
  snooze: SnoozePolicy;
  quiet: QuietPolicy;
  digestEligible: boolean;
};

export type AttentionForResponse = {
  kind: NotificationKind;
  priority: NotificationPriority;
  requiresAcknowledgement: boolean;
  protected: boolean;
  recipientReasons: readonly NotificationRecipientReason[];
};

export class AttentionResponsePolicyError extends Error {
  readonly code:
    | "critical_requires_protected"
    | "critical_requires_acknowledgement"
    | "update_cannot_be_protected"
    | "update_cannot_require_acknowledgement";

  constructor(code: AttentionResponsePolicyError["code"]) {
    super(code);
    this.name = "AttentionResponsePolicyError";
    this.code = code;
  }
}

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  UPDATE: 0,
  NEEDS_ATTENTION: 1,
  URGENT: 2,
  CRITICAL: 3,
};

/**
 * A later rise clears a stored snooze. N4D performs that write.
 * The same band, and a drop, leave a future snooze in place.
 */
export function priorityRiseClearsSnooze(
  previous: NotificationPriority,
  next: NotificationPriority,
): boolean {
  return PRIORITY_RANK[next] > PRIORITY_RANK[previous];
}

export function primaryResponsibilityReason(
  reasons: readonly NotificationRecipientReason[],
): NotificationRecipientReason | null {
  if (reasons.length !== 1) return null;
  return reasons[0] ?? null;
}

export function assertAttentionResponseInvariants(attention: AttentionForResponse): void {
  if (attention.priority === NotificationPriority.CRITICAL && !attention.protected) {
    throw new AttentionResponsePolicyError("critical_requires_protected");
  }
  if (attention.priority === NotificationPriority.CRITICAL && !attention.requiresAcknowledgement) {
    throw new AttentionResponsePolicyError("critical_requires_acknowledgement");
  }
  if (attention.priority === NotificationPriority.UPDATE && attention.protected) {
    throw new AttentionResponsePolicyError("update_cannot_be_protected");
  }
  if (attention.priority === NotificationPriority.UPDATE && attention.requiresAcknowledgement) {
    throw new AttentionResponsePolicyError("update_cannot_require_acknowledgement");
  }
}

function snoozePolicy(attention: AttentionForResponse): SnoozePolicy {
  if (attention.priority === NotificationPriority.UPDATE || attention.protected) return SNOOZE_POLICY.NONE;
  if (attention.priority === NotificationPriority.URGENT) return SNOOZE_POLICY.NON_RESPONSIBLE_RECIPIENT_ONLY;
  if (attention.priority === NotificationPriority.NEEDS_ATTENTION) return SNOOZE_POLICY.RECIPIENT_ALLOWED;
  return SNOOZE_POLICY.NONE;
}

export function deriveResponsePolicy(attention: AttentionForResponse): ResponsePolicy {
  assertAttentionResponseInvariants(attention);
  const update = attention.priority === NotificationPriority.UPDATE;
  const primary = primaryResponsibilityReason(attention.recipientReasons);
  const escalationEligible =
    attention.kind === NotificationKind.OPERATIONAL && attention.requiresAcknowledgement && !update;
  const responsibilityReconciliationEligible =
    attention.kind === NotificationKind.OPERATIONAL &&
    !update &&
    (primary === NotificationRecipientReason.ON_DUTY_SUPERVISOR ||
      primary === NotificationRecipientReason.ON_CALL_RESPONDER);
  return {
    escalationEligible,
    acknowledgementStopsExpansion: escalationEligible,
    primaryResponsibilityReason: primary,
    responsibilityReconciliationEligible,
    snooze: snoozePolicy(attention),
    quiet: update ? QUIET_POLICY.UPDATE_ONLY : QUIET_POLICY.NONE,
    digestEligible: update,
  };
}
