/**
 * N4A response-policy contract. No database, no clock, no settings.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { NotificationKind, NotificationPriority, NotificationRecipientReason } from "@prisma/client";

import { evaluateAttentionPolicy, type AttentionPolicyResult } from "./policy-registry";
import {
  AttentionResponsePolicyError,
  deriveResponsePolicy,
  priorityRiseClearsSnooze,
  RESPONSIBILITY_RECONCILIATION_CLOCK,
  type AttentionForResponse,
  type ResponsePolicy,
} from "./response-policy";

function notify(result: AttentionPolicyResult) {
  assert.equal(result.outcome, "notify");
  if (result.outcome !== "notify") throw new Error("expected notify");
  return result;
}

function expectResponse(
  result: AttentionPolicyResult,
  response: ResponsePolicy,
  attention: {
    priority: string;
    requiresAcknowledgement: boolean;
    protected: boolean;
    recipientReasons: string[];
  },
) {
  const row = notify(result);
  assert.equal(row.priority, attention.priority);
  assert.equal(row.requiresAcknowledgement, attention.requiresAcknowledgement);
  assert.equal(row.protected, attention.protected);
  assert.deepEqual(row.recipientReasons, attention.recipientReasons);
  assert.deepEqual(row.response, response);
  assert.equal("priority" in row.response, false);
  assert.equal("recipientReasons" in row.response, false);
}

test("an Update cannot be protected, require acknowledgement, escalate, or snooze", () => {
  const evidence = notify(evaluateAttentionPolicy({ eventType: "evidence.failed" }));
  const issue = notify(evaluateAttentionPolicy({ eventType: "issue.created" }));
  const assigned = notify(evaluateAttentionPolicy({ eventType: "work_order.assigned" }));
  const assignment = notify(
    evaluateAttentionPolicy({ eventType: "assignment.changed", serviceState: "inactive" }),
  );
  for (const row of [evidence, issue, assigned, assignment]) {
    assert.equal(row.priority, "UPDATE");
    assert.equal(row.protected, false);
    assert.equal(row.requiresAcknowledgement, false);
    assert.equal(row.response.escalationEligible, false);
    assert.equal(row.response.acknowledgementStopsExpansion, false);
    assert.equal(row.response.responsibilityReconciliationEligible, false);
    assert.equal(row.response.snooze, "NONE");
    assert.equal(row.response.quiet, "UPDATE_ONLY");
    assert.equal(row.response.digestEligible, true);
  }
  assert.throws(
    () =>
      deriveResponsePolicy({
        kind: NotificationKind.OPERATIONAL,
        priority: NotificationPriority.UPDATE,
        requiresAcknowledgement: false,
        protected: true,
        recipientReasons: [NotificationRecipientReason.ON_DUTY_SUPERVISOR],
      }),
    (error: unknown) => error instanceof AttentionResponsePolicyError && error.code === "update_cannot_be_protected",
  );
  assert.throws(
    () =>
      deriveResponsePolicy({
        kind: NotificationKind.OPERATIONAL,
        priority: NotificationPriority.UPDATE,
        requiresAcknowledgement: true,
        protected: false,
        recipientReasons: [NotificationRecipientReason.ON_DUTY_SUPERVISOR],
      }),
    (error: unknown) =>
      error instanceof AttentionResponsePolicyError && error.code === "update_cannot_require_acknowledgement",
  );
});

test("Needs Attention snooze follows protected, and acknowledgement is not inferred from priority", () => {
  const open: AttentionForResponse = {
    kind: NotificationKind.OPERATIONAL,
    priority: NotificationPriority.NEEDS_ATTENTION,
    requiresAcknowledgement: true,
    protected: false,
    recipientReasons: [NotificationRecipientReason.ON_CALL_RESPONDER],
  };
  const allowed = deriveResponsePolicy(open);
  assert.equal(allowed.snooze, "RECIPIENT_ALLOWED");
  assert.equal(allowed.quiet, "NONE");
  assert.equal(allowed.digestEligible, false);
  assert.equal(allowed.escalationEligible, true);

  const protectedNeedsAttention = deriveResponsePolicy({ ...open, protected: true, requiresAcknowledgement: false });
  assert.equal(protectedNeedsAttention.snooze, "NONE");
  assert.equal(protectedNeedsAttention.quiet, "NONE");
  assert.equal(protectedNeedsAttention.digestEligible, false);
  assert.equal(protectedNeedsAttention.escalationEligible, false);
  assert.equal(protectedNeedsAttention.acknowledgementStopsExpansion, false);
});

test("Urgent snooze is restricted unless the thread is protected, which forbids it", () => {
  const open: AttentionForResponse = {
    kind: NotificationKind.OPERATIONAL,
    priority: NotificationPriority.URGENT,
    requiresAcknowledgement: true,
    protected: false,
    recipientReasons: [NotificationRecipientReason.ON_CALL_RESPONDER],
  };
  assert.equal(deriveResponsePolicy(open).snooze, "NON_RESPONSIBLE_RECIPIENT_ONLY");
  const protectedUrgent = deriveResponsePolicy({ ...open, protected: true });
  assert.equal(protectedUrgent.snooze, "NONE");
  assert.equal(protectedUrgent.quiet, "NONE");
  assert.equal(protectedUrgent.digestEligible, false);
  assert.equal(protectedUrgent.escalationEligible, true);
});

test("Critical must be protected and require acknowledgement, and that pair can escalate", () => {
  const legal = deriveResponsePolicy({
    kind: NotificationKind.OPERATIONAL,
    priority: NotificationPriority.CRITICAL,
    requiresAcknowledgement: true,
    protected: true,
    recipientReasons: [NotificationRecipientReason.ON_DUTY_SUPERVISOR],
  });
  assert.equal(legal.escalationEligible, true);
  assert.equal(legal.acknowledgementStopsExpansion, true);
  assert.equal(legal.snooze, "NONE");
  assert.equal(legal.quiet, "NONE");
  assert.equal(legal.digestEligible, false);
  assert.equal(legal.responsibilityReconciliationEligible, true);

  assert.throws(
    () =>
      deriveResponsePolicy({
        kind: NotificationKind.OPERATIONAL,
        priority: NotificationPriority.CRITICAL,
        requiresAcknowledgement: true,
        protected: false,
        recipientReasons: [NotificationRecipientReason.ON_DUTY_SUPERVISOR],
      }),
    (error: unknown) => error instanceof AttentionResponsePolicyError && error.code === "critical_requires_protected",
  );
  assert.throws(
    () =>
      deriveResponsePolicy({
        kind: NotificationKind.OPERATIONAL,
        priority: NotificationPriority.CRITICAL,
        requiresAcknowledgement: false,
        protected: true,
        recipientReasons: [NotificationRecipientReason.ON_DUTY_SUPERVISOR],
      }),
    (error: unknown) =>
      error instanceof AttentionResponsePolicyError && error.code === "critical_requires_acknowledgement",
  );
});

test("response policy does not rewrite attention priority or recipient reasons", () => {
  const input: AttentionForResponse = {
    kind: NotificationKind.OPERATIONAL,
    priority: NotificationPriority.NEEDS_ATTENTION,
    requiresAcknowledgement: true,
    protected: false,
    recipientReasons: [NotificationRecipientReason.WORK_ORDER_ASSIGNEE],
  };
  const frozen = Object.freeze({ ...input, recipientReasons: Object.freeze([...input.recipientReasons]) });
  const response = deriveResponsePolicy(frozen);
  assert.equal(frozen.priority, NotificationPriority.NEEDS_ATTENTION);
  assert.deepEqual(frozen.recipientReasons, [NotificationRecipientReason.WORK_ORDER_ASSIGNEE]);
  assert.equal(response.primaryResponsibilityReason, "WORK_ORDER_ASSIGNEE");
  assert.equal(response.responsibilityReconciliationEligible, false);
  assert.equal(response.escalationEligible, true);
});

test("live opening events keep their attention and gain the response contract", () => {
  expectResponse(
    evaluateAttentionPolicy({ eventType: "assignment.changed", serviceState: "inactive" }),
    {
      escalationEligible: false,
      acknowledgementStopsExpansion: false,
      primaryResponsibilityReason: null,
      responsibilityReconciliationEligible: false,
      snooze: "NONE",
      quiet: "UPDATE_ONLY",
      digestEligible: true,
    },
    {
      priority: "UPDATE",
      requiresAcknowledgement: false,
      protected: false,
      recipientReasons: ["CURRENT_ASSIGNEE", "ON_DUTY_SUPERVISOR"],
    },
  );

  expectResponse(evaluateAttentionPolicy({ eventType: "coverage.became_at_risk", coverageState: "AT_RISK" }), {
    escalationEligible: false,
    acknowledgementStopsExpansion: false,
    primaryResponsibilityReason: "ON_DUTY_SUPERVISOR",
    responsibilityReconciliationEligible: true,
    snooze: "RECIPIENT_ALLOWED",
    quiet: "NONE",
    digestEligible: false,
  }, {
    priority: "NEEDS_ATTENTION",
    requiresAcknowledgement: false,
    protected: false,
    recipientReasons: ["ON_DUTY_SUPERVISOR"],
  });

  expectResponse(
    evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "before", minutesUntilService: 121 },
    }),
    {
      escalationEligible: true,
      acknowledgementStopsExpansion: true,
      primaryResponsibilityReason: "ON_DUTY_SUPERVISOR",
      responsibilityReconciliationEligible: true,
      snooze: "RECIPIENT_ALLOWED",
      quiet: "NONE",
      digestEligible: false,
    },
    {
      priority: "NEEDS_ATTENTION",
      requiresAcknowledgement: true,
      protected: false,
      recipientReasons: ["ON_DUTY_SUPERVISOR"],
    },
  );

  expectResponse(
    evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "before", minutesUntilService: 30 },
    }),
    {
      escalationEligible: true,
      acknowledgementStopsExpansion: true,
      primaryResponsibilityReason: "ON_DUTY_SUPERVISOR",
      responsibilityReconciliationEligible: true,
      snooze: "NONE",
      quiet: "NONE",
      digestEligible: false,
    },
    {
      priority: "URGENT",
      requiresAcknowledgement: true,
      protected: true,
      recipientReasons: ["ON_DUTY_SUPERVISOR"],
    },
  );

  const active = notify(
    evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "active" },
    }),
  );
  assert.equal(active.priority, "CRITICAL");
  assert.equal(active.protected, true);
  assert.equal(active.response.snooze, "NONE");
  assert.equal(active.response.digestEligible, false);
  assert.equal(active.response.escalationEligible, true);

  const reevaluate = notify(
    evaluateAttentionPolicy({
      eventType: "attention.reevaluate",
      coverageState: "UNCOVERED",
      timing: { serviceState: "active" },
    }),
  );
  assert.equal(reevaluate.priority, active.priority);
  assert.deepEqual(reevaluate.recipientReasons, active.recipientReasons);
  assert.deepEqual(reevaluate.response, active.response);

  expectResponse(evaluateAttentionPolicy({ eventType: "milestone.overdue" }), {
    escalationEligible: true,
    acknowledgementStopsExpansion: true,
    primaryResponsibilityReason: "ON_DUTY_SUPERVISOR",
    responsibilityReconciliationEligible: true,
    snooze: "NONE",
    quiet: "NONE",
    digestEligible: false,
  }, {
    priority: "URGENT",
    requiresAcknowledgement: true,
    protected: true,
    recipientReasons: ["ON_DUTY_SUPERVISOR"],
  });

  expectResponse(evaluateAttentionPolicy({ eventType: "work_order.assigned" }), {
    escalationEligible: false,
    acknowledgementStopsExpansion: false,
    primaryResponsibilityReason: "WORK_ORDER_ASSIGNEE",
    responsibilityReconciliationEligible: false,
    snooze: "NONE",
    quiet: "UPDATE_ONLY",
    digestEligible: true,
  }, {
    priority: "UPDATE",
    requiresAcknowledgement: false,
    protected: false,
    recipientReasons: ["WORK_ORDER_ASSIGNEE"],
  });

  expectResponse(evaluateAttentionPolicy({ eventType: "work_order.overdue" }), {
    escalationEligible: true,
    acknowledgementStopsExpansion: true,
    primaryResponsibilityReason: "WORK_ORDER_ASSIGNEE",
    responsibilityReconciliationEligible: false,
    snooze: "RECIPIENT_ALLOWED",
    quiet: "NONE",
    digestEligible: false,
  }, {
    priority: "NEEDS_ATTENTION",
    requiresAcknowledgement: true,
    protected: false,
    recipientReasons: ["WORK_ORDER_ASSIGNEE"],
  });

  expectResponse(evaluateAttentionPolicy({ eventType: "work_order.intervention_required" }), {
    escalationEligible: true,
    acknowledgementStopsExpansion: true,
    primaryResponsibilityReason: "ON_CALL_RESPONDER",
    responsibilityReconciliationEligible: true,
    snooze: "NON_RESPONSIBLE_RECIPIENT_ONLY",
    quiet: "NONE",
    digestEligible: false,
  }, {
    priority: "URGENT",
    requiresAcknowledgement: true,
    protected: false,
    recipientReasons: ["ON_CALL_RESPONDER"],
  });

  expectResponse(evaluateAttentionPolicy({ eventType: "asset.out_of_service" }), {
    escalationEligible: true,
    acknowledgementStopsExpansion: true,
    primaryResponsibilityReason: "ON_CALL_RESPONDER",
    responsibilityReconciliationEligible: true,
    snooze: "RECIPIENT_ALLOWED",
    quiet: "NONE",
    digestEligible: false,
  }, {
    priority: "NEEDS_ATTENTION",
    requiresAcknowledgement: true,
    protected: false,
    recipientReasons: ["ON_CALL_RESPONDER"],
  });
});

test("response policy leaves source clocks and later engines alone", () => {
  assert.equal(RESPONSIBILITY_RECONCILIATION_CLOCK, "evaluator_now");
  assert.equal(priorityRiseClearsSnooze("NEEDS_ATTENTION", "URGENT"), true);
  assert.equal(priorityRiseClearsSnooze("URGENT", "CRITICAL"), true);
  assert.equal(priorityRiseClearsSnooze("URGENT", "URGENT"), false);
  assert.equal(priorityRiseClearsSnooze("CRITICAL", "URGENT"), false);

  const source = readFileSync(new URL("./response-policy.ts", import.meta.url), "utf8");
  assert.equal(source.includes("COVERAGE_UNCOVERED"), false);
  assert.equal(source.includes("dueAt"), false);
  assert.equal(source.includes("criticality"), false);
  assert.equal(source.includes("RepairPriority"), false);
  assert.equal(source.includes("snoozedUntil"), false);

  const scheduled = readFileSync(new URL("../scheduled-evaluation/types.ts", import.meta.url), "utf8");
  assert.equal(scheduled.includes("notifications.escalation"), true);
  assert.equal(scheduled.includes("notifications.responsibility-reconciliation"), true);
  const reconciliationAt = scheduled.indexOf("notifications.responsibility-reconciliation");
  const escalationAt = scheduled.indexOf("notifications.escalation");
  assert.equal(reconciliationAt < escalationAt, true);

  const early = notify(
    evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "before", minutesUntilService: 31 },
    }),
  );
  const imminent = notify(
    evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "before", minutesUntilService: 30 },
    }),
  );
  assert.equal(early.priority, "NEEDS_ATTENTION");
  assert.equal(early.protected, false);
  assert.equal(imminent.priority, "URGENT");
  assert.equal(imminent.protected, true);
  assert.equal(early.response.escalationEligible, true);
  assert.equal(imminent.response.escalationEligible, true);
});
