/**
 * N1B typed attention policy.
 *
 * The domain supplies the fact. This module decides how much attention that
 * fact deserves, and which recipient reasons apply. It does not choose a User,
 * read a clock, read a domain table, or write a notification row.
 *
 * Published Department policy replaces these numbers later. N1 has one code
 * version so a later processor can store what it decided under.
 */

import {
  NotificationKind,
  NotificationPriority,
  NotificationRecipientReason,
} from "@prisma/client";

import type { CanonicalCoverageState } from "@/lib/scheduling/coverage-expectations/types";

import { isNotificationEventType, type NotificationEventType } from "./event-types";
import { deriveResponsePolicy, type ResponsePolicy } from "./response-policy";

export const NOTIFICATION_POLICY_VERSION = "notifications-n1b-v1" as const;

/**
 * Section 16 names two pre-service lines for uncovered coverage:
 * more than 120 minutes before service, and within 30 minutes.
 * N1D certified the unnamed interval, 31 through 120 minutes including exactly
 * 120, as Needs Attention. Urgent begins only at
 * 30 minutes or fewer, and only while service has not started. Active service
 * is Critical and overrides the clock.
 */
export const COVERAGE_UNCOVERED_EARLY_AFTER_MINUTES = 120;
export const COVERAGE_UNCOVERED_IMMINENT_MINUTES = 30;

export type AttentionAudience = "floor" | "governance";

export type CoverageServiceTiming =
  | { serviceState: "before"; minutesUntilService: number }
  | { serviceState: "active" };

export type CoverageAtRiskPolicyInput = {
  eventType: "coverage.became_at_risk";
  coverageState: CanonicalCoverageState;
};

export type CoverageUncoveredPolicyInput = {
  eventType: "coverage.became_uncovered";
  coverageState: CanonicalCoverageState;
  timing: CoverageServiceTiming;
};

export type CoverageRestoredPolicyInput = {
  eventType: "coverage.restored";
  coverageState: CanonicalCoverageState;
};

export type AttentionEndedReason =
  | "service_window_ended"
  | "requirement_removed"
  | "deadline_moved"
  | "deadline_removed"
  | "responsibility_ended"
  | "work_order_cancelled"
  | "intervention_cleared"
  | "asset_retired";

/** Same uncovered facts, asked again because time passed. Not a new Coverage transition. */
export type AttentionReevaluatePolicyInput = {
  eventType: "attention.reevaluate";
  coverageState: CanonicalCoverageState;
  timing: CoverageServiceTiming;
};

/** The operational window ended. The condition did not recover. */
export type AttentionExpiredPolicyInput = {
  eventType: "attention.expired";
  endedReason: AttentionEndedReason;
};

export type AssignmentChangedPolicyInput = {
  eventType: "assignment.changed";
  /** The publisher states whether service is active. Policy does not read a clock. */
  serviceState: "active" | "inactive";
};

export type SyncConflictPolicyInput = {
  eventType: "sync.conflict_detected";
  /** True only when the conflict blocks evidence or coverage for the active operation. */
  blocksActiveOperation: boolean;
  /**
   * OfflineSyncReceipt already names this User. Recipient reasons have no value
   * for "the person on the sync receipt," so the id stays beside the reasons.
   */
  syncActorUserId: string | null;
};

export type PublicationFailedPolicyInput = {
  eventType: "publication.failed";
};

/**
 * A REQUIRED Key Point passed its expected minute with no actual.
 * Critical when service is materially late is not admitted: the domain has no
 * separate "materially late" fact beyond the due minute.
 */
export type MilestoneOverduePolicyInput = {
  eventType: "milestone.overdue";
};

/** The Key Point actual was recorded. Resolves the overdue thread. */
export type MilestoneRecordedPolicyInput = {
  eventType: "milestone.recorded";
};

/** The due time moved out of the past. The Key Point did not occur. */
export type MilestoneDeadlineMovedPolicyInput = {
  eventType: "milestone.deadline_moved";
};

/**
 * Responsibility for a Work Order was assigned to an Employee.
 * Repair priority is not an input. Section 16 row 12's Urgent line is the
 * later intervention and overdue condition, which this event does not assert.
 */
export type WorkOrderAssignedPolicyInput = {
  eventType: "work_order.assigned";
};

/**
 * Assignment attention is no longer actionable.
 * Responsibility moved, was cleared, or the Work Order was completed or cancelled.
 * This is not Work Order completion, and it is not an unassigned notice.
 */
export type WorkOrderAssignmentEndedPolicyInput = {
  eventType: "work_order.assignment_ended";
  endedReason: "responsibility_ended";
};

/**
 * An open Work Order is at or past its operational deadline.
 * Repair priority is not an input. Emergency intervention and on-call
 * response are a different source fact. Ordinary overdue is Needs Attention
 * for the assignee. There is no stored "after N days" facility threshold.
 */
/**
 * A submitted Record is out of standard.
 * Catalog field `critical` is an inspection score fact, not this priority.
 * Corrective text does not resolve the notice. The Record stays out of standard,
 * so this is an Update and does not stay in active attention.
 */
/**
 * A new Issue exists.
 * Issue priority and operational impact describe the Issue.
 * They are not this notification priority.
 */
export type IssueCreatedPolicyInput = {
  eventType: "issue.created";
};

export type EvidenceFailedPolicyInput = {
  eventType: "evidence.failed";
};

export type WorkOrderOverduePolicyInput = {
  eventType: "work_order.overdue";
};

/** The Work Order was completed. The missed deadline recovered. */
export type WorkOrderOverdueResolvedPolicyInput = {
  eventType: "work_order.overdue_resolved";
};

export type WorkOrderOverdueEndedReason = "deadline_moved" | "deadline_removed" | "work_order_cancelled";

/** The missed deadline is no longer the open condition. The work was not completed. */
export type WorkOrderOverdueEndedPolicyInput = {
  eventType: "work_order.overdue_ended";
  endedReason: WorkOrderOverdueEndedReason;
};

/**
 * An open Work Order requires immediate operational response.
 * One Immediate fact is Urgent. It is not Critical and it is not protected.
 * Repair priority, Asset criticality, Issue priority, and Request urgency are not inputs.
 */
export type WorkOrderInterventionRequiredPolicyInput = {
  eventType: "work_order.intervention_required";
};

/** Immediate response was set back to Standard. The Work Order was not completed. */
export type WorkOrderInterventionClearedPolicyInput = {
  eventType: "work_order.intervention_cleared";
  endedReason: "intervention_cleared";
};

/** The Work Order was completed while immediate response was active. */
export type WorkOrderInterventionCompletedPolicyInput = {
  eventType: "work_order.intervention_completed";
};

/** The Work Order was cancelled while immediate response was active. */
export type WorkOrderInterventionCancelledPolicyInput = {
  eventType: "work_order.intervention_cancelled";
  endedReason: "work_order_cancelled";
};

/** The Asset cannot perform its function. Criticality is not an input. */
export type AssetOutOfServicePolicyInput = {
  eventType: "asset.out_of_service";
};

/** The Asset can perform its function again. This resolves one outage. It is not a new notice. */
export type AssetReturnedToServicePolicyInput = {
  eventType: "asset.returned_to_service";
};

/** The Asset was retired while out of service. The outage did not recover. */
export type AssetOutageEndedPolicyInput = {
  eventType: "asset.outage_ended";
  endedReason: "asset_retired";
};

type SupportedPolicyInput =
  | CoverageAtRiskPolicyInput
  | CoverageUncoveredPolicyInput
  | CoverageRestoredPolicyInput
  | AttentionReevaluatePolicyInput
  | AttentionExpiredPolicyInput
  | AssignmentChangedPolicyInput
  | SyncConflictPolicyInput
  | PublicationFailedPolicyInput
  | MilestoneOverduePolicyInput
  | MilestoneRecordedPolicyInput
  | MilestoneDeadlineMovedPolicyInput
  | WorkOrderAssignedPolicyInput
  | WorkOrderAssignmentEndedPolicyInput
  | IssueCreatedPolicyInput
  | EvidenceFailedPolicyInput
  | WorkOrderOverduePolicyInput
  | WorkOrderOverdueResolvedPolicyInput
  | WorkOrderOverdueEndedPolicyInput
  | WorkOrderInterventionRequiredPolicyInput
  | WorkOrderInterventionClearedPolicyInput
  | WorkOrderInterventionCompletedPolicyInput
  | WorkOrderInterventionCancelledPolicyInput
  | AssetOutOfServicePolicyInput
  | AssetReturnedToServicePolicyInput
  | AssetOutageEndedPolicyInput;

type SupportedEventType = SupportedPolicyInput["eventType"];

export type ReservedPolicyInput = {
  eventType: Exclude<NotificationEventType, SupportedEventType>;
};

export type AttentionPolicyInput = SupportedPolicyInput | ReservedPolicyInput;

type PolicyInputRole = Extract<
  | keyof CoverageAtRiskPolicyInput
  | keyof CoverageUncoveredPolicyInput
  | keyof CoverageRestoredPolicyInput
  | keyof AssignmentChangedPolicyInput
  | keyof SyncConflictPolicyInput
  | keyof PublicationFailedPolicyInput,
  "role" | "repairPriority" | "assetCriticality" | "severity"
>;
const _policyIgnoresRoleAndDomainScales: [PolicyInputRole] extends [never] ? true : never = true;
void _policyIgnoresRoleAndDomainScales;

export type AttentionExplanationFacts = {
  eventType: string;
  coverageState?: CanonicalCoverageState;
  serviceState?: "before" | "active" | "inactive";
  minutesUntilService?: number | null;
  blocksActiveOperation?: boolean;
  endedReason?: AttentionEndedReason;
};

type NotifyResult = {
  outcome: "notify";
  kind: NotificationKind;
  category: "coverage" | "assignment" | "sync" | "publication" | "key_point" | "work_order" | "record" | "issue" | "asset";
  priority: NotificationPriority;
  requiresAcknowledgement: boolean;
  protected: boolean;
  policyVersion: typeof NOTIFICATION_POLICY_VERSION;
  audience: AttentionAudience;
  explanationFacts: AttentionExplanationFacts;
  recipientReasons: NotificationRecipientReason[];
  /** A User the source already named. Not a recipient-reason enum value. */
  namedSourceUserId: string | null;
  /** How the platform may respond after this attention exists. It does not choose the fields above. */
  response: ResponsePolicy;
};

export type AttentionPolicyResult =
  | NotifyResult
  | {
      outcome: "resolve";
      policyVersion: typeof NOTIFICATION_POLICY_VERSION;
      explanationFacts: AttentionExplanationFacts;
    }
  | {
      outcome: "expire";
      policyVersion: typeof NOTIFICATION_POLICY_VERSION;
      explanationFacts: AttentionExplanationFacts;
    }
  | {
      outcome: "unsupported";
      reason: string;
      eventType: string;
      policyVersion: typeof NOTIFICATION_POLICY_VERSION;
    };

function unsupported(eventType: string, reason: string): AttentionPolicyResult {
  return {
    outcome: "unsupported",
    reason,
    eventType,
    policyVersion: NOTIFICATION_POLICY_VERSION,
  };
}

function notify(input: Omit<NotifyResult, "outcome" | "policyVersion" | "response">): NotifyResult {
  return {
    outcome: "notify",
    policyVersion: NOTIFICATION_POLICY_VERSION,
    ...input,
    response: deriveResponsePolicy(input),
  };
}

function reservedReason(eventType: string): string {
  if (eventType.startsWith("chat.")) return "chat_is_not_operational_attention";
  if (eventType === "corrective_action.overdue") return "corrective_action_due_time_not_available";
  if (eventType === "handoff.overdue") return "handoff_record_not_available";
  if (eventType.startsWith("readiness.")) return "readiness_state_not_available";
  return "event_not_in_n1b_policy";
}

function coverageAtRisk(input: CoverageAtRiskPolicyInput): AttentionPolicyResult {
  if (input.coverageState !== "AT_RISK") {
    return unsupported(input.eventType, "coverage_state_does_not_match_event");
  }
  return notify({
    kind: NotificationKind.OPERATIONAL,
    category: "coverage",
    priority: NotificationPriority.NEEDS_ATTENTION,
    requiresAcknowledgement: false,
    protected: false,
    audience: "floor",
    explanationFacts: {
      eventType: input.eventType,
      coverageState: "AT_RISK",
    },
    recipientReasons: [NotificationRecipientReason.ON_DUTY_SUPERVISOR],
    namedSourceUserId: null,
  });
}

function coverageUncovered(input: CoverageUncoveredPolicyInput): AttentionPolicyResult {
  if (input.coverageState !== "UNCOVERED") {
    return unsupported(input.eventType, "coverage_state_does_not_match_event");
  }
  const decision = uncoveredDecision(input.timing);
  if ("error" in decision) return unsupported(input.eventType, decision.error);
  return notify({
    kind: NotificationKind.OPERATIONAL,
    category: "coverage",
    priority: decision.priority,
    requiresAcknowledgement: true,
    protected: decision.protected,
    audience: "floor",
    explanationFacts: {
      eventType: input.eventType,
      coverageState: "UNCOVERED",
      serviceState: decision.serviceState,
      minutesUntilService: decision.minutesUntilService,
    },
    // The Department Manager is the later escalation, not the first recipient.
    recipientReasons: [NotificationRecipientReason.ON_DUTY_SUPERVISOR],
    namedSourceUserId: null,
  });
}

function uncoveredDecision(
  timing: CoverageServiceTiming,
):
  | {
      priority: NotificationPriority;
      protected: boolean;
      serviceState: "before" | "active";
      minutesUntilService: number | null;
    }
  | { error: "service_timing_not_authoritative" } {
  if (timing.serviceState === "active") {
    return {
      priority: NotificationPriority.CRITICAL,
      protected: true,
      serviceState: "active",
      minutesUntilService: null,
    };
  }
  const minutes = timing.minutesUntilService;
  if (!Number.isFinite(minutes) || minutes < 0) {
    return { error: "service_timing_not_authoritative" };
  }
  if (minutes <= COVERAGE_UNCOVERED_IMMINENT_MINUTES) {
    return {
      priority: NotificationPriority.URGENT,
      protected: true,
      serviceState: "before",
      minutesUntilService: minutes,
    };
  }
  return {
    priority: NotificationPriority.NEEDS_ATTENTION,
    protected: false,
    serviceState: "before",
    minutesUntilService: minutes,
  };
}

function attentionReevaluate(input: AttentionReevaluatePolicyInput): AttentionPolicyResult {
  if (input.coverageState !== "UNCOVERED") {
    return unsupported(input.eventType, "coverage_state_does_not_match_event");
  }
  const decision = uncoveredDecision(input.timing);
  if ("error" in decision) return unsupported(input.eventType, decision.error);
  return notify({
    kind: NotificationKind.OPERATIONAL,
    category: "coverage",
    priority: decision.priority,
    requiresAcknowledgement: true,
    protected: decision.protected,
    audience: "floor",
    explanationFacts: {
      eventType: input.eventType,
      coverageState: "UNCOVERED",
      serviceState: decision.serviceState,
      minutesUntilService: decision.minutesUntilService,
    },
    recipientReasons: [NotificationRecipientReason.ON_DUTY_SUPERVISOR],
    namedSourceUserId: null,
  });
}

function attentionExpired(input: AttentionExpiredPolicyInput): AttentionPolicyResult {
  return {
    outcome: "expire",
    policyVersion: NOTIFICATION_POLICY_VERSION,
    explanationFacts: {
      eventType: input.eventType,
      endedReason: input.endedReason,
    },
  };
}

function coverageRestored(input: CoverageRestoredPolicyInput): AttentionPolicyResult {
  if (input.coverageState !== "COVERED") {
    return unsupported(input.eventType, "coverage_state_does_not_match_event");
  }
  return {
    outcome: "resolve",
    policyVersion: NOTIFICATION_POLICY_VERSION,
    explanationFacts: {
      eventType: input.eventType,
      coverageState: "COVERED",
    },
  };
}

function assignmentChanged(input: AssignmentChangedPolicyInput): AttentionPolicyResult {
  if (input.serviceState !== "active" && input.serviceState !== "inactive") {
    return unsupported(input.eventType, "service_state_not_authoritative");
  }
  const active = input.serviceState === "active";
  return notify({
    kind: NotificationKind.OPERATIONAL,
    category: "assignment",
    priority: active ? NotificationPriority.NEEDS_ATTENTION : NotificationPriority.UPDATE,
    requiresAcknowledgement: false,
    protected: false,
    audience: "floor",
    explanationFacts: {
      eventType: input.eventType,
      serviceState: input.serviceState,
    },
    recipientReasons: [
      NotificationRecipientReason.CURRENT_ASSIGNEE,
      NotificationRecipientReason.ON_DUTY_SUPERVISOR,
    ],
    namedSourceUserId: null,
  });
}

function syncConflict(input: SyncConflictPolicyInput): AttentionPolicyResult {
  const named = input.syncActorUserId?.trim() ? input.syncActorUserId.trim() : null;
  return notify({
    kind: NotificationKind.SYSTEM,
    category: "sync",
    priority: input.blocksActiveOperation
      ? NotificationPriority.URGENT
      : NotificationPriority.NEEDS_ATTENTION,
    requiresAcknowledgement: true,
    protected: true,
    audience: "floor",
    explanationFacts: {
      eventType: input.eventType,
      blocksActiveOperation: input.blocksActiveOperation,
    },
    recipientReasons: input.blocksActiveOperation
      ? [NotificationRecipientReason.ON_DUTY_SUPERVISOR]
      : [],
    namedSourceUserId: named,
  });
}

function milestoneOverdue(input: MilestoneOverduePolicyInput): AttentionPolicyResult {
  return notify({
    kind: NotificationKind.OPERATIONAL,
    category: "key_point",
    priority: NotificationPriority.URGENT,
    requiresAcknowledgement: true,
    protected: true,
    audience: "floor",
    explanationFacts: { eventType: input.eventType },
    recipientReasons: [NotificationRecipientReason.ON_DUTY_SUPERVISOR],
    namedSourceUserId: null,
  });
}

function milestoneRecorded(input: MilestoneRecordedPolicyInput): AttentionPolicyResult {
  return {
    outcome: "resolve",
    policyVersion: NOTIFICATION_POLICY_VERSION,
    explanationFacts: { eventType: input.eventType },
  };
}

function milestoneDeadlineMoved(input: MilestoneDeadlineMovedPolicyInput): AttentionPolicyResult {
  return {
    outcome: "expire",
    policyVersion: NOTIFICATION_POLICY_VERSION,
    explanationFacts: {
      eventType: input.eventType,
      endedReason: "deadline_moved",
    },
  };
}

function workOrderAssigned(_input: WorkOrderAssignedPolicyInput): AttentionPolicyResult {
  return notify({
    kind: NotificationKind.OPERATIONAL,
    category: "work_order",
    priority: NotificationPriority.UPDATE,
    requiresAcknowledgement: false,
    protected: false,
    audience: "floor",
    explanationFacts: { eventType: "work_order.assigned" },
    recipientReasons: [NotificationRecipientReason.WORK_ORDER_ASSIGNEE],
    namedSourceUserId: null,
  });
}

function workOrderAssignmentEnded(
  input: WorkOrderAssignmentEndedPolicyInput,
): AttentionPolicyResult {
  if (input.endedReason !== "responsibility_ended") {
    return unsupported(input.eventType, "assignment_end_not_authoritative");
  }
  return {
    outcome: "expire",
    policyVersion: NOTIFICATION_POLICY_VERSION,
    explanationFacts: {
      eventType: input.eventType,
      endedReason: "responsibility_ended",
    },
  };
}

function issueCreated(_input: IssueCreatedPolicyInput): AttentionPolicyResult {
  return notify({
    kind: NotificationKind.OPERATIONAL,
    category: "issue",
    priority: NotificationPriority.UPDATE,
    requiresAcknowledgement: false,
    protected: false,
    audience: "floor",
    explanationFacts: { eventType: "issue.created" },
    recipientReasons: [NotificationRecipientReason.ON_DUTY_SUPERVISOR],
    namedSourceUserId: null,
  });
}

function evidenceFailed(_input: EvidenceFailedPolicyInput): AttentionPolicyResult {
  return notify({
    kind: NotificationKind.OPERATIONAL,
    category: "record",
    priority: NotificationPriority.UPDATE,
    requiresAcknowledgement: false,
    protected: false,
    audience: "floor",
    explanationFacts: { eventType: "evidence.failed" },
    recipientReasons: [NotificationRecipientReason.ON_DUTY_SUPERVISOR],
    namedSourceUserId: null,
  });
}

function assetOutOfService(_input: AssetOutOfServicePolicyInput): AttentionPolicyResult {
  return notify({
    kind: NotificationKind.OPERATIONAL,
    category: "asset",
    priority: NotificationPriority.NEEDS_ATTENTION,
    requiresAcknowledgement: true,
    protected: false,
    audience: "floor",
    explanationFacts: { eventType: "asset.out_of_service" },
    recipientReasons: [NotificationRecipientReason.ON_CALL_RESPONDER],
    namedSourceUserId: null,
  });
}

function assetReturnedToService(_input: AssetReturnedToServicePolicyInput): AttentionPolicyResult {
  return {
    outcome: "resolve",
    policyVersion: NOTIFICATION_POLICY_VERSION,
    explanationFacts: { eventType: "asset.returned_to_service" },
  };
}

function assetOutageEnded(input: AssetOutageEndedPolicyInput): AttentionPolicyResult {
  if (input.endedReason !== "asset_retired") {
    return unsupported(input.eventType, "asset_end_not_authoritative");
  }
  return {
    outcome: "expire",
    policyVersion: NOTIFICATION_POLICY_VERSION,
    explanationFacts: { eventType: input.eventType, endedReason: input.endedReason },
  };
}

function workOrderInterventionRequired(
  _input: WorkOrderInterventionRequiredPolicyInput,
): AttentionPolicyResult {
  return notify({
    kind: NotificationKind.OPERATIONAL,
    category: "work_order",
    priority: NotificationPriority.URGENT,
    requiresAcknowledgement: true,
    protected: false,
    audience: "floor",
    explanationFacts: { eventType: "work_order.intervention_required" },
    recipientReasons: [NotificationRecipientReason.ON_CALL_RESPONDER],
    namedSourceUserId: null,
  });
}

function workOrderInterventionCleared(
  input: WorkOrderInterventionClearedPolicyInput,
): AttentionPolicyResult {
  if (input.endedReason !== "intervention_cleared") {
    return unsupported(input.eventType, "intervention_end_not_authoritative");
  }
  return {
    outcome: "expire",
    policyVersion: NOTIFICATION_POLICY_VERSION,
    explanationFacts: { eventType: input.eventType, endedReason: input.endedReason },
  };
}

function workOrderInterventionCompleted(
  _input: WorkOrderInterventionCompletedPolicyInput,
): AttentionPolicyResult {
  return {
    outcome: "resolve",
    policyVersion: NOTIFICATION_POLICY_VERSION,
    explanationFacts: { eventType: "work_order.intervention_completed" },
  };
}

function workOrderInterventionCancelled(
  input: WorkOrderInterventionCancelledPolicyInput,
): AttentionPolicyResult {
  if (input.endedReason !== "work_order_cancelled") {
    return unsupported(input.eventType, "intervention_end_not_authoritative");
  }
  return {
    outcome: "expire",
    policyVersion: NOTIFICATION_POLICY_VERSION,
    explanationFacts: { eventType: input.eventType, endedReason: input.endedReason },
  };
}

function workOrderOverdue(_input: WorkOrderOverduePolicyInput): AttentionPolicyResult {
  return notify({
    kind: NotificationKind.OPERATIONAL,
    category: "work_order",
    priority: NotificationPriority.NEEDS_ATTENTION,
    requiresAcknowledgement: true,
    protected: false,
    audience: "floor",
    explanationFacts: { eventType: "work_order.overdue" },
    recipientReasons: [NotificationRecipientReason.WORK_ORDER_ASSIGNEE],
    namedSourceUserId: null,
  });
}

function workOrderOverdueResolved(_input: WorkOrderOverdueResolvedPolicyInput): AttentionPolicyResult {
  return {
    outcome: "resolve",
    policyVersion: NOTIFICATION_POLICY_VERSION,
    explanationFacts: { eventType: "work_order.overdue_resolved" },
  };
}

function workOrderOverdueEnded(input: WorkOrderOverdueEndedPolicyInput): AttentionPolicyResult {
  if (
    input.endedReason !== "deadline_moved" &&
    input.endedReason !== "deadline_removed" &&
    input.endedReason !== "work_order_cancelled"
  ) {
    return unsupported(input.eventType, "overdue_end_not_authoritative");
  }
  return {
    outcome: "expire",
    policyVersion: NOTIFICATION_POLICY_VERSION,
    explanationFacts: {
      eventType: input.eventType,
      endedReason: input.endedReason,
    },
  };
}

function publicationFailed(input: PublicationFailedPolicyInput): AttentionPolicyResult {
  return notify({
    kind: NotificationKind.ADMIN,
    category: "publication",
    priority: NotificationPriority.NEEDS_ATTENTION,
    requiresAcknowledgement: true,
    protected: true,
    audience: "governance",
    explanationFacts: {
      eventType: input.eventType,
    },
    recipientReasons: [
      NotificationRecipientReason.FACILITY_ADMIN,
      NotificationRecipientReason.DEPARTMENT_MANAGER,
    ],
    namedSourceUserId: null,
  });
}

export function evaluateAttentionPolicy(input: AttentionPolicyInput): AttentionPolicyResult {
  if (!isNotificationEventType(input.eventType)) {
    return unsupported(input.eventType, "unknown_event");
  }
  switch (input.eventType) {
    case "coverage.became_at_risk":
      return coverageAtRisk(input);
    case "coverage.became_uncovered":
      return coverageUncovered(input);
    case "coverage.restored":
      return coverageRestored(input);
    case "attention.reevaluate":
      return attentionReevaluate(input);
    case "attention.expired":
      return attentionExpired(input);
    case "assignment.changed":
      return assignmentChanged(input);
    case "sync.conflict_detected":
      return syncConflict(input);
    case "publication.failed":
      return publicationFailed(input);
    case "milestone.overdue":
      return milestoneOverdue(input);
    case "milestone.recorded":
      return milestoneRecorded(input);
    case "milestone.deadline_moved":
      return milestoneDeadlineMoved(input);
    case "work_order.assigned":
      return workOrderAssigned(input);
    case "work_order.assignment_ended":
      return workOrderAssignmentEnded(input);
    case "issue.created":
      return issueCreated(input);
    case "evidence.failed":
      return evidenceFailed(input);
    case "work_order.overdue":
      return workOrderOverdue(input);
    case "work_order.overdue_resolved":
      return workOrderOverdueResolved(input);
    case "work_order.overdue_ended":
      return workOrderOverdueEnded(input);
    case "work_order.intervention_required":
      return workOrderInterventionRequired(input);
    case "work_order.intervention_cleared":
      return workOrderInterventionCleared(input);
    case "work_order.intervention_completed":
      return workOrderInterventionCompleted(input);
    case "work_order.intervention_cancelled":
      return workOrderInterventionCancelled(input);
    case "asset.out_of_service":
      return assetOutOfService(input);
    case "asset.returned_to_service":
      return assetReturnedToService(input);
    case "asset.outage_ended":
      return assetOutageEnded(input);
    default:
      return unsupported(input.eventType, reservedReason(input.eventType));
  }
}
