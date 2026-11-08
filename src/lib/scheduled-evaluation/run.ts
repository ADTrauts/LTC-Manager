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
  input: { now?: Date; keys?: readonly ScheduledEvaluatorKey[]; facilityIds?: string[] } = {},
): Promise<ScheduledEvaluationRunSummary> {
  const now = input.now ?? new Date();
  const summary: ScheduledEvaluationRunSummary = { ...EMPTY, evaluators: 0, skipped: 0, outboxIds: [] };
  for (const evaluator of listScheduledEvaluators(input.keys)) {
    summary.evaluators += 1;
    const startedAt = new Date();
    const owner = await tryAcquireScheduledEvaluationLease(db, evaluator.key, now);
    if (!owner) {
      summary.skipped += 1;
      logRun(evaluator.key, startedAt, { ...EMPTY, failures: 0 }, "skipped");
      continue;
    }
    const deadline = new Date(startedAt.getTime() + SCHEDULED_EVALUATION_EXECUTION_BUDGET_MS);
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
      await recordEvaluatorHealth(db, {
        evaluatorKey: evaluator.key,
        owner,
        now: new Date(),
        outcome:
          result.failures > 0 ? "failed" : result.cycleCompleted === false ? "incomplete" : "completed",
        failures: result.failures,
      });
      logRun(evaluator.key, startedAt, result, "completed");
    } catch (error) {
      summary.failures += 1;
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
      await processNotificationOutboxRow(db, { outboxId });
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
  outcome: "completed" | "skipped",
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
