/**
 * Escalation timing is the thread's open time, and reconciliation runs first.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { listScheduledEvaluators } from "@/lib/scheduled-evaluation/registry";

import {
  ATTENTION_ESCALATION_DELAY_MS,
  ESCALATION_MAX_PAGES,
  ESCALATION_PAGE,
  ESCALATION_POLICY_VERSION,
  escalationDeadline,
  evaluateAcknowledgementEscalation,
  initialEscalationTiming,
  primaryAcknowledgementExists,
} from "./escalation";

test("the acknowledgement deadline is fifteen minutes after the thread opens", () => {
  const opened = new Date("2026-10-29T22:55:00.000Z");
  const due = escalationDeadline(opened);
  assert.equal(ATTENTION_ESCALATION_DELAY_MS, 15 * 60 * 1000);
  assert.equal(due.getTime() - opened.getTime(), ATTENTION_ESCALATION_DELAY_MS);
  const timing = initialEscalationTiming(opened);
  assert.equal(timing.escalationDueAt.toISOString(), due.toISOString());
  assert.equal(timing.escalationPolicyVersion, ESCALATION_POLICY_VERSION);
  assert.equal(escalationDeadline(opened).toISOString(), timing.escalationDueAt.toISOString());
});

test("only a primary-reason acknowledgement stops escalation", () => {
  const rows = [
    { reason: "DEPARTMENT_MANAGER" as const, acknowledgedAt: new Date("2026-10-29T23:00:00.000Z") },
    { reason: "ON_CALL_RESPONDER" as const, acknowledgedAt: null },
  ];
  assert.equal(primaryAcknowledgementExists(rows, "ON_CALL_RESPONDER"), false);
  assert.equal(
    primaryAcknowledgementExists(
      [...rows, { reason: "ON_CALL_RESPONDER", acknowledgedAt: new Date("2026-10-29T23:01:00.000Z") }],
      "ON_CALL_RESPONDER",
    ),
    true,
  );
});

test("responsibility reconciliation is registered ahead of escalation", () => {
  const keys = listScheduledEvaluators().map((evaluator) => evaluator.key);
  assert.equal(
    keys.indexOf("notifications.responsibility-reconciliation") < keys.indexOf("notifications.escalation"),
    true,
  );
  assert.equal(ESCALATION_PAGE, 100);
  assert.equal(ESCALATION_MAX_PAGES, 5);
});

test("the escalation scan stops after its page cap", async () => {
  let pages = 0;
  const due = new Date("2026-10-29T23:00:00.000Z");
  const db = {
    notification: {
      findMany: async (args: { distinct?: string[]; take?: number }) => {
        if (args.distinct) return [{ facilityId: "fac" }];
        pages += 1;
        assert.equal(args.take, ESCALATION_PAGE);
        return Array.from({ length: ESCALATION_PAGE }, (_, index) => ({
          id: `page-${pages}-${index}`,
          facilityId: "fac",
          departmentId: "dept",
          kind: "OPERATIONAL",
          priority: "NEEDS_ATTENTION",
          requiresAcknowledgement: true,
          metadata: { protected: false },
          escalationDueAt: due,
        }));
      },
    },
  };
  const result = await evaluateAcknowledgementEscalation({
    db: db as never,
    now: due,
  });
  assert.equal(pages, ESCALATION_MAX_PAGES * 9);
  assert.equal(result.failures, ESCALATION_PAGE * ESCALATION_MAX_PAGES * 9);
  assert.equal(result.transitions, 0);
});
