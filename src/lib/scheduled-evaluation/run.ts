import type { PrismaClient } from "@prisma/client";

import { processNotificationOutboxRow } from "@/lib/notifications/processing";

import { SCHEDULED_EVALUATION_EXECUTION_BUDGET_MS } from "./cadence";
import {
  recordEvaluatorHealth,
  releaseScheduledEvaluationLease,
  renewScheduledEvaluationLease,
  tryAcquireScheduledEvaluationLease,
} from "./lease";
import { listScheduledEvaluators } from "./registry";
import type {
  ScheduledEvaluationDb,
  ScheduledEvaluationResult,
  ScheduledEvaluationRunSummary,
  ScheduledEvaluatorKey,
} from "./types";

const EMPTY: ScheduledEvaluationResult = {
  facilitiesScanned: 0,
  candidates: 0,
  transitions: 0,
  reevaluations: 0,
  failures: 0,
  outboxIds: [],
};

/**
 * Invoke registered domain evaluators.
 * One evaluator failure does not run inside another's transaction.
 * Outbox rows are returned for processing after this function returns.
 */
export async function runScheduledEvaluations(
  db: ScheduledEvaluationDb,
  input: { now?: Date; keys?: readonly ScheduledEvaluatorKey[]; facilityIds?: string[]; deadline?: Date } = {},
): Promise<ScheduledEvaluationRunSummary> {
  const now = input.now ?? new Date();
  const passDeadline = new Date(Math.min(
    input.deadline?.getTime() ?? Infinity,
    Date.now() + SCHEDULED_EVALUATION_EXECUTION_BUDGET_MS,
  ));
  const evaluators = listScheduledEvaluators(input.keys);
  const summary: ScheduledEvaluationRunSummary = {
    ...EMPTY, evaluators: 0, skipped: 0, outboxIds: [], cycleCompleted: true,
  };
  for (const [index, evaluator] of evaluators.entries()) {
    summary.evaluators += 1;
    const startedAt = new Date();
    if (Date.now() >= passDeadline.getTime()) {
      summary.skipped += 1;
      summary.cycleCompleted = false;
      logRun(evaluator.key, startedAt, EMPTY, "skipped");
      continue;
    }
    // Share the remaining time without starving later evaluators. Each domain
    // retains its own durable continuation and existing reconciliation order.
    const remaining = passDeadline.getTime() - Date.now();
    const deadline = new Date(Math.min(passDeadline.getTime(),
      Date.now() + Math.floor(remaining / (evaluators.length - index))));
    const owner = await tryAcquireScheduledEvaluationLease(db, evaluator.key, new Date());
    if (!owner) {
      summary.skipped += 1;
      summary.cycleCompleted = false;
      logRun(evaluator.key, startedAt, { ...EMPTY, failures: 0 }, "skipped");
      continue;
    }
    try {
      const result = await evaluator.evaluate({
        db,
        now,
        facilityIds: input.facilityIds,
        control: {
          deadline,
          owner,
          renew: () => renewScheduledEvaluationLease(db, evaluator.key, owner, new Date()),
        },
      });
      summary.facilitiesScanned += result.facilitiesScanned;
      summary.candidates += result.candidates;
      summary.transitions += result.transitions;
      summary.reevaluations += result.reevaluations;
      summary.failures += result.failures;
      summary.outboxIds.push(...result.outboxIds);
      if (result.cycleCompleted === false) summary.cycleCompleted = false;
      await recordEvaluatorHealth(db, {
        evaluatorKey: evaluator.key,
        owner,
        now: new Date(),
        outcome:
          result.failures > 0 ? "failed" : result.cycleCompleted === false ? "incomplete" : "completed",
        failures: result.failures,
      });
      logRun(evaluator.key, startedAt, result, result.failures > 0 ? "failed" : result.cycleCompleted === false ? "incomplete" : "completed");
    } catch (error) {
      summary.failures += 1;
      summary.cycleCompleted = false;
      await recordEvaluatorHealth(db, {
        evaluatorKey: evaluator.key,
        owner,
        now: new Date(),
        outcome: "failed",
        failures: 1,
      }).catch(() => undefined);
      console.info(
        JSON.stringify({
          event: "scheduled_evaluation",
          evaluator: evaluator.key,
          outcome: "failed",
          error: error instanceof Error ? error.name : "Error",
        }),
      );
    } finally {
      await releaseScheduledEvaluationLease(db, evaluator.key, owner, new Date());
    }
  }
  return summary;
}

/**
 * After the domain transactions commit. A processing failure leaves the outbox row.
 */
export async function processScheduledEvaluationOutbox(
  db: PrismaClient,
  outboxIds: readonly string[],
): Promise<number> {
  let failures = 0;
  for (const outboxId of outboxIds) {
    try {
      const result = await processNotificationOutboxRow(db, { outboxId });
      if (result.outcome === "failed") failures += 1;
    } catch {
      failures += 1;
    }
  }
  return failures;
}

function logRun(
  evaluator: string,
  startedAt: Date,
  result: ScheduledEvaluationResult,
  outcome: "completed" | "incomplete" | "failed" | "skipped",
): void {
  console.info(
    JSON.stringify({
      event: "scheduled_evaluation",
      evaluator,
      outcome,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      facilitiesScanned: result.facilitiesScanned,
      candidates: result.candidates,
      transitions: result.transitions,
      reevaluations: result.reevaluations,
      failures: result.failures,
    }),
  );
}
