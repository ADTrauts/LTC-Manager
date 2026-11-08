/**
 * Hermetic N1B policy tests. No database and no clock.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { AssetCriticality, NotificationPriority, RepairPriority } from "@prisma/client";

import { coverageAttentionThreadKey } from "./thread-key";
import {
  COVERAGE_UNCOVERED_EARLY_AFTER_MINUTES,
  COVERAGE_UNCOVERED_IMMINENT_MINUTES,
  evaluateAttentionPolicy,
  NOTIFICATION_POLICY_VERSION,
  type AttentionPolicyInput,
  type AttentionPolicyResult,
} from "./policy-registry";

function notify(result: AttentionPolicyResult) {
  assert.equal(result.outcome, "notify");
  if (result.outcome !== "notify") throw new Error("expected notify");
  return result;
}

test("coverage policy follows the Section 16 lines and leaves 31–120 at Needs Attention", () => {
  assert.equal(COVERAGE_UNCOVERED_EARLY_AFTER_MINUTES, 120);
  assert.equal(COVERAGE_UNCOVERED_IMMINENT_MINUTES, 30);

  const atRisk = notify(
    evaluateAttentionPolicy({ eventType: "coverage.became_at_risk", coverageState: "AT_RISK" }),
  );
  assert.equal(atRisk.kind, "OPERATIONAL");
  assert.equal(atRisk.category, "coverage");
  assert.equal(atRisk.priority, "NEEDS_ATTENTION");
  assert.equal(atRisk.requiresAcknowledgement, false);
  assert.equal(atRisk.protected, false);
  assert.deepEqual(atRisk.recipientReasons, ["ON_DUTY_SUPERVISOR"]);
  assert.equal(atRisk.namedSourceUserId, null);
  assert.equal(atRisk.policyVersion, NOTIFICATION_POLICY_VERSION);

  const early = notify(
    evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "before", minutesUntilService: 121 },
    }),
  );
  assert.equal(early.priority, "NEEDS_ATTENTION");
  assert.equal(early.protected, false);
  assert.equal(early.requiresAcknowledgement, true);

  const atEarlyBoundary = notify(
    evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "before", minutesUntilService: 120 },
    }),
  );
  const insideUnnamedGap = notify(
    evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "before", minutesUntilService: 31 },
    }),
  );
  assert.equal(atEarlyBoundary.priority, "NEEDS_ATTENTION");
  assert.equal(atEarlyBoundary.protected, false);
  assert.equal(insideUnnamedGap.priority, "NEEDS_ATTENTION");
  assert.equal(insideUnnamedGap.protected, false);

  const imminent = notify(
    evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "before", minutesUntilService: 30 },
    }),
  );
  const due = notify(
    evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "before", minutesUntilService: 0 },
    }),
  );
  assert.equal(imminent.priority, "URGENT");
  assert.equal(imminent.protected, true);
  assert.equal(due.priority, "URGENT");
  assert.equal(due.protected, true);

  const active = notify(
    evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "active" },
    }),
  );
  assert.equal(active.priority, "CRITICAL");
  assert.equal(active.protected, true);
  assert.equal(active.explanationFacts.minutesUntilService, null);
  assert.deepEqual(active.recipientReasons, ["ON_DUTY_SUPERVISOR"]);

  const restored = evaluateAttentionPolicy({
    eventType: "coverage.restored",
    coverageState: "COVERED",
  });
  assert.equal(restored.outcome, "resolve");
  assert.equal(restored.policyVersion, NOTIFICATION_POLICY_VERSION);
  assert.equal("priority" in restored, false);
  assert.equal("recipientReasons" in restored, false);
  assert.equal("resolvedAt" in restored, false);
  if (restored.outcome === "resolve") {
    assert.equal(restored.explanationFacts.coverageState, "COVERED");
  }
});

test("the same coverage facts keep the same priority when a role is attached", () => {
  const facts = {
    eventType: "coverage.became_uncovered" as const,
    coverageState: "UNCOVERED" as const,
    timing: { serviceState: "before" as const, minutesUntilService: 10 },
  };
  const asSupervisor = evaluateAttentionPolicy({ ...facts, role: "SUPERVISOR" } as AttentionPolicyInput);
  const asStaff = evaluateAttentionPolicy({ ...facts, role: "STAFF" } as AttentionPolicyInput);
  assert.deepEqual(asSupervisor, asStaff);
  assert.equal(notify(asSupervisor).priority, "URGENT");
});

test("coverage priority does not change the coverage thread identity", () => {
  const thread = {
    kind: "coverage" as const,
    facilityId: "facility-1",
    serviceDate: "2026-10-29",
    departmentId: "department-1",
    spaceId: "space-1",
    responsibility: "SERVER",
    cycleStableKey: "breakfast",
    episodeId: "episode-1",
  };
  const key = coverageAttentionThreadKey(thread);
  const early = notify(
    evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "before", minutesUntilService: 200 },
    }),
  );
  const active = notify(
    evaluateAttentionPolicy({
      eventType: "coverage.became_uncovered",
      coverageState: "UNCOVERED",
      timing: { serviceState: "active" },
    }),
  );
  assert.notEqual(early.priority, active.priority);
  assert.equal(coverageAttentionThreadKey(thread), key);
  assert.equal("threadKey" in early, false);
  assert.equal("dedupeKey" in active, false);
  assert.equal(JSON.stringify(early).includes(key), false);
});

test("domain scale names do not set notification priority", () => {
  const atRisk = notify(
    evaluateAttentionPolicy({ eventType: "coverage.became_at_risk", coverageState: "AT_RISK" }),
  );
  assert.equal(atRisk.priority, NotificationPriority.NEEDS_ATTENTION);
  assert.notEqual(atRisk.priority, RepairPriority.EMERGENCY);
  assert.notEqual(atRisk.priority, AssetCriticality.CRITICAL);
  assert.notEqual(atRisk.priority, "act_now");

  const ordinary = notify(
    evaluateAttentionPolicy({ eventType: "assignment.changed", serviceState: "inactive" }),
  );
  assert.equal(ordinary.priority, NotificationPriority.UPDATE);
  assert.notEqual(ordinary.priority, RepairPriority.EMERGENCY);
  assert.notEqual(ordinary.priority, "act_now");
});

test("assignment, sync, and publication stay on the fixture contract", () => {
  const update = notify(
    evaluateAttentionPolicy({ eventType: "assignment.changed", serviceState: "inactive" }),
  );
  assert.equal(update.priority, "UPDATE");
  assert.equal(update.requiresAcknowledgement, false);
  assert.equal(update.protected, false);
  assert.deepEqual(update.recipientReasons, ["CURRENT_ASSIGNEE", "ON_DUTY_SUPERVISOR"]);

  const duringService = notify(
    evaluateAttentionPolicy({ eventType: "assignment.changed", serviceState: "active" }),
  );
  assert.equal(duringService.priority, "NEEDS_ATTENTION");
  assert.deepEqual(duringService.recipientReasons, update.recipientReasons);

  const review = notify(
    evaluateAttentionPolicy({
      eventType: "sync.conflict_detected",
      blocksActiveOperation: false,
      syncActorUserId: "user-1",
    }),
  );
  assert.equal(review.kind, "SYSTEM");
  assert.equal(review.priority, "NEEDS_ATTENTION");
  assert.equal(review.protected, true);
  assert.deepEqual(review.recipientReasons, []);
  assert.equal(review.namedSourceUserId, "user-1");

  const blocking = notify(
    evaluateAttentionPolicy({
      eventType: "sync.conflict_detected",
      blocksActiveOperation: true,
      syncActorUserId: "user-1",
    }),
  );
  assert.equal(blocking.priority, "URGENT");
  assert.deepEqual(blocking.recipientReasons, ["ON_DUTY_SUPERVISOR"]);
  assert.equal(blocking.namedSourceUserId, "user-1");

  const publication = notify(evaluateAttentionPolicy({ eventType: "publication.failed" }));
  assert.equal(publication.kind, "ADMIN");
  assert.equal(publication.priority, "NEEDS_ATTENTION");
  assert.equal(publication.requiresAcknowledgement, true);
  assert.equal(publication.protected, true);
  assert.equal(publication.audience, "governance");
  assert.deepEqual(publication.recipientReasons, ["FACILITY_ADMIN", "DEPARTMENT_MANAGER"]);
});

test("a required Key Point overdue is urgent operational attention for the on-duty supervisor", () => {
  const overdue = notify(evaluateAttentionPolicy({ eventType: "milestone.overdue" }));
  assert.equal(overdue.kind, "OPERATIONAL");
  assert.equal(overdue.category, "key_point");
  assert.equal(overdue.priority, "URGENT");
  assert.equal(overdue.requiresAcknowledgement, true);
  assert.equal(overdue.protected, true);
  assert.deepEqual(overdue.recipientReasons, ["ON_DUTY_SUPERVISOR"]);
  assert.equal(overdue.namedSourceUserId, null);
  assert.equal("role" in overdue, false);

  const recorded = evaluateAttentionPolicy({ eventType: "milestone.recorded" });
  assert.equal(recorded.outcome, "resolve");
  const moved = evaluateAttentionPolicy({ eventType: "milestone.deadline_moved" });
  assert.equal(moved.outcome, "expire");
  if (moved.outcome === "expire") assert.equal(moved.explanationFacts.endedReason, "deadline_moved");
});

test("reserved and unknown events stay unsupported", () => {
  const cases: Array<{ input: AttentionPolicyInput; reason: string }> = [
    {
      input: { eventType: "chat.message.created" },
      reason: "chat_is_not_operational_attention",
    },
    {
      input: { eventType: "chat.mention.created" },
      reason: "chat_is_not_operational_attention",
    },
    {
      input: { eventType: "corrective_action.overdue" },
      reason: "corrective_action_due_time_not_available",
    },
    {
      input: { eventType: "handoff.overdue" },
      reason: "handoff_record_not_available",
    },
    {
      input: { eventType: "readiness.became_at_risk" },
      reason: "readiness_state_not_available",
    },
    {
      input: { eventType: "readiness.became_degraded" },
      reason: "readiness_state_not_available",
    },
    {
      input: { eventType: "shift.called_off" },
      reason: "event_not_in_n1b_policy",
    },
  ];

  for (const entry of cases) {
    const result = evaluateAttentionPolicy(entry.input);
    assert.equal(result.outcome, "unsupported");
    assert.equal("priority" in result, false);
    if (result.outcome === "unsupported") {
      assert.equal(result.reason, entry.reason);
      assert.equal(result.policyVersion, NOTIFICATION_POLICY_VERSION);
    }
  }

  const unknown = evaluateAttentionPolicy({ eventType: "not.an.event" } as AttentionPolicyInput);
  assert.equal(unknown.outcome, "unsupported");
  if (unknown.outcome === "unsupported") assert.equal(unknown.reason, "unknown_event");

  const mismatched = evaluateAttentionPolicy({
    eventType: "coverage.became_uncovered",
    coverageState: "NOT_YET_ASSIGNED",
    timing: { serviceState: "active" },
  });
  assert.equal(mismatched.outcome, "unsupported");
  if (mismatched.outcome === "unsupported") {
    assert.equal(mismatched.reason, "coverage_state_does_not_match_event");
  }

  const badClock = evaluateAttentionPolicy({
    eventType: "coverage.became_uncovered",
    coverageState: "UNCOVERED",
    timing: { serviceState: "before", minutesUntilService: -1 },
  });
  assert.equal(badClock.outcome, "unsupported");
});

test("work order assignment is an Update for the assignee only", () => {
  const assigned = evaluateAttentionPolicy({ eventType: "work_order.assigned" });
  assert.equal(assigned.outcome, "notify");
  if (assigned.outcome !== "notify") return;
  assert.equal(assigned.kind, "OPERATIONAL");
  assert.equal(assigned.category, "work_order");
  assert.equal(assigned.priority, "UPDATE");
  assert.equal(assigned.requiresAcknowledgement, false);
  assert.equal(assigned.protected, false);
  assert.deepEqual(assigned.recipientReasons, ["WORK_ORDER_ASSIGNEE"]);
  assert.equal(assigned.explanationFacts.eventType, "work_order.assigned");
  assert.equal("repairPriority" in assigned.explanationFacts, false);

  const ended = evaluateAttentionPolicy({
    eventType: "work_order.assignment_ended",
    endedReason: "responsibility_ended",
  });
  assert.equal(ended.outcome, "expire");
  if (ended.outcome === "expire") {
    assert.equal(ended.explanationFacts.endedReason, "responsibility_ended");
  }

  const intervention = evaluateAttentionPolicy({ eventType: "work_order.intervention_required" });
  assert.equal(intervention.outcome, "notify");
  if (intervention.outcome !== "notify") return;
  assert.equal(intervention.kind, "OPERATIONAL");
  assert.equal(intervention.category, "work_order");
  assert.equal(intervention.priority, "URGENT");
  assert.equal(intervention.priority === "CRITICAL", false);
  assert.equal(intervention.requiresAcknowledgement, true);
  assert.equal(intervention.protected, false);
  assert.deepEqual(intervention.recipientReasons, ["ON_CALL_RESPONDER"]);
  assert.equal("priority" in intervention.explanationFacts, false);
  assert.equal(
    evaluateAttentionPolicy({
      eventType: "work_order.intervention_cleared",
      endedReason: "intervention_cleared",
    }).outcome,
    "expire",
  );
  assert.equal(
    evaluateAttentionPolicy({ eventType: "work_order.intervention_completed" }).outcome,
    "resolve",
  );
  assert.equal(
    evaluateAttentionPolicy({
      eventType: "work_order.intervention_cancelled",
      endedReason: "work_order_cancelled",
    }).outcome,
    "expire",
  );

  const overdue = evaluateAttentionPolicy({ eventType: "work_order.overdue" });
  assert.equal(overdue.outcome, "notify");
  if (overdue.outcome !== "notify") return;
  assert.equal(overdue.kind, "OPERATIONAL");
  assert.equal(overdue.priority, "NEEDS_ATTENTION");
  assert.equal(overdue.requiresAcknowledgement, true);
  assert.equal(overdue.protected, false);
  assert.deepEqual(overdue.recipientReasons, ["WORK_ORDER_ASSIGNEE"]);
  assert.equal("repairPriority" in overdue.explanationFacts, false);

  const emergency = evaluateAttentionPolicy({ eventType: "work_order.overdue" });
  if (emergency.outcome === "notify") assert.notEqual(emergency.priority, "CRITICAL");

  assert.equal(
    evaluateAttentionPolicy({ eventType: "work_order.overdue_resolved" }).outcome,
    "resolve",
  );
  const moved = evaluateAttentionPolicy({
    eventType: "work_order.overdue_ended",
    endedReason: "deadline_moved",
  });
  assert.equal(moved.outcome, "expire");

  const failed = evaluateAttentionPolicy({ eventType: "evidence.failed" });
  assert.equal(failed.outcome, "notify");
  if (failed.outcome !== "notify") return;
  assert.equal(failed.kind, "OPERATIONAL");
  assert.equal(failed.category, "record");
  assert.equal(failed.priority, "UPDATE");
  assert.equal(failed.requiresAcknowledgement, false);
  assert.equal(failed.protected, false);
  assert.deepEqual(failed.recipientReasons, ["ON_DUTY_SUPERVISOR"]);
  assert.equal(failed.priority === "URGENT" || failed.priority === "CRITICAL", false);

  const created = evaluateAttentionPolicy({ eventType: "issue.created" });
  assert.equal(created.outcome, "notify");
  if (created.outcome !== "notify") return;
  assert.equal(created.kind, "OPERATIONAL");
  assert.equal(created.category, "issue");
  assert.equal(created.priority, "UPDATE");
  assert.equal(created.requiresAcknowledgement, false);
  assert.equal(created.protected, false);
  assert.deepEqual(created.recipientReasons, ["ON_DUTY_SUPERVISOR"]);
  assert.equal("operationalImpact" in created.explanationFacts, false);
  assert.equal("priority" in created.explanationFacts, false);

  const outage = evaluateAttentionPolicy({ eventType: "asset.out_of_service" });
  assert.equal(outage.outcome, "notify");
  if (outage.outcome !== "notify") return;
  assert.equal(outage.kind, "OPERATIONAL");
  assert.equal(outage.category, "asset");
  assert.equal(outage.priority, "NEEDS_ATTENTION");
  assert.equal(outage.requiresAcknowledgement, true);
  assert.equal(outage.protected, false);
  assert.deepEqual(outage.recipientReasons, ["ON_CALL_RESPONDER"]);
  assert.equal("criticality" in outage.explanationFacts, false);
  assert.equal(evaluateAttentionPolicy({ eventType: "asset.returned_to_service" }).outcome, "resolve");
  assert.equal(
    evaluateAttentionPolicy({ eventType: "asset.outage_ended", endedReason: "asset_retired" }).outcome,
    "expire",
  );
});

test("policy version is a deliberate identifier", () => {
  assert.equal(NOTIFICATION_POLICY_VERSION, "notifications-n1b-v1");
  assert.equal(/\d{4}-\d{2}-\d{2}/.test(NOTIFICATION_POLICY_VERSION), false);
  const result = evaluateAttentionPolicy({ eventType: "publication.failed" });
  assert.equal(result.policyVersion, "notifications-n1b-v1");
});
