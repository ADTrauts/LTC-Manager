import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { evaluateAttentionPolicy } from "@/lib/notifications/policy-registry";

import { SCHEDULED_EVALUATION_CADENCE_MS } from "./cadence";
import { isScheduledEvaluationAuthorized } from "./cron";
import { listScheduledEvaluators } from "./registry";
import { FUTURE_SCHEDULED_EVALUATOR_KEYS } from "./types";
import { coveragePriorityBand } from "@/lib/scheduling/coverage-episodes/time-evaluation";

const start = new Date("2026-10-29T11:00:00.000Z");
const end = new Date("2026-10-29T14:00:00.000Z");

test("coverage priority bands change only at 30 minutes and at service", () => {
  const early = new Date(start.getTime() - 90 * 60 * 1000);
  const boundary = new Date(start.getTime() - 120 * 60 * 1000);
  const imminent = new Date(start.getTime() - 20 * 60 * 1000);
  const exactly30 = new Date(start.getTime() - 30 * 60 * 1000);
  assert.equal(
    coveragePriorityBand({ state: "UNCOVERED", cycleStartsAt: start, cycleEndsAt: end, at: early }),
    "needs_attention",
  );
  assert.equal(
    coveragePriorityBand({ state: "UNCOVERED", cycleStartsAt: start, cycleEndsAt: end, at: boundary }),
    "needs_attention",
  );
  assert.equal(
    coveragePriorityBand({ state: "UNCOVERED", cycleStartsAt: start, cycleEndsAt: end, at: exactly30 }),
    "urgent",
  );
  assert.equal(
    coveragePriorityBand({ state: "UNCOVERED", cycleStartsAt: start, cycleEndsAt: end, at: imminent }),
    "urgent",
  );
  assert.equal(
    coveragePriorityBand({ state: "UNCOVERED", cycleStartsAt: start, cycleEndsAt: end, at: start }),
    "critical",
  );
  assert.equal(
    coveragePriorityBand({ state: "UNCOVERED", cycleStartsAt: start, cycleEndsAt: end, at: end }),
    null,
  );
  assert.equal(
    coveragePriorityBand({ state: "AT_RISK", cycleStartsAt: start, cycleEndsAt: end, at: start }),
    null,
  );
  assert.equal(
    coveragePriorityBand({ state: "NOT_YET_ASSIGNED", cycleStartsAt: start, cycleEndsAt: end, at: imminent }),
    null,
  );
});

test("scheduled evaluation registers coverage and leaves future domains unregistered", () => {
  assert.deepEqual(
    listScheduledEvaluators().map((evaluator) => evaluator.key),
    [
      "coverage.time-boundaries",
      "key-points.overdue",
      "work-orders.overdue",
      "notifications.responsibility-reconciliation",
      "notifications.escalation",
      "notifications.external-delivery",
    ],
  );
  for (const key of FUTURE_SCHEDULED_EVALUATOR_KEYS) {
    assert.equal(listScheduledEvaluators().some((evaluator) => evaluator.key === key), false);
  }
  assert.equal(SCHEDULED_EVALUATION_CADENCE_MS, 5 * 60 * 1000);
  const keys = listScheduledEvaluators().map((evaluator) => evaluator.key);
  assert.equal(
    keys.indexOf("notifications.responsibility-reconciliation") < keys.indexOf("notifications.escalation"),
    true,
  );
});

test("attention reevaluation uses coverage policy and expiry is not restoration", () => {
  const urgent = evaluateAttentionPolicy({
    eventType: "attention.reevaluate",
    coverageState: "UNCOVERED",
    timing: { serviceState: "before", minutesUntilService: 20 },
  });
  assert.equal(urgent.outcome, "notify");
  if (urgent.outcome === "notify") assert.equal(urgent.priority, "URGENT");

  const critical = evaluateAttentionPolicy({
    eventType: "attention.reevaluate",
    coverageState: "UNCOVERED",
    timing: { serviceState: "active" },
  });
  assert.equal(critical.outcome, "notify");
  if (critical.outcome === "notify") assert.equal(critical.priority, "CRITICAL");

  const expired = evaluateAttentionPolicy({
    eventType: "attention.expired",
    endedReason: "service_window_ended",
  });
  assert.equal(expired.outcome, "expire");
  assert.equal("priority" in expired, false);
});

test("the scheduled evaluation route requires the cron secret and is not on the daily cron file", () => {
  const secret = "scheduled-evaluation-secret";
  const url = "https://vssyl.com/api/internal/scheduled-evaluation";
  assert.equal(isScheduledEvaluationAuthorized(new Request(url), secret), false);
  assert.equal(
    isScheduledEvaluationAuthorized(new Request(url, { headers: { authorization: "Bearer other" } }), secret),
    false,
  );
  assert.equal(
    isScheduledEvaluationAuthorized(new Request(url, { headers: { authorization: `Bearer ${secret}` } }), secret),
    true,
  );
  const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  assert.equal(vercel.includes("scheduled-evaluation"), false);
  const route = readFileSync(
    join(process.cwd(), "src/app/api/internal/scheduled-evaluation/route.ts"),
    "utf8",
  );
  assert.match(route, /handleScheduledEvaluationCron/);
});
