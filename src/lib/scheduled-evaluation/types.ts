/**
 * Scheduled Evaluation asks a domain whether time passing changed a fact.
 * It does not decide the fact.
 */

import type { PrismaClient } from "@prisma/client";

export type ScheduledEvaluationDb = PrismaClient;

/** Registered now. Future keys stay unregistered until that domain owns the rule. */
export type ScheduledEvaluatorKey =
  | "coverage.time-boundaries"
  | "key-points.overdue"
  | "work-orders.overdue"
  | "notifications.responsibility-reconciliation"
  | "notifications.escalation"
  | "notifications.external-delivery";

/**
 * `records.corrective-action-overdue` is not a candidate.
 * A Record's corrective text is what was done at submission.
 * It has no open owner and no due time. Later work is a recheck,
 * an Issue, or a Work Order.
 */
export const FUTURE_SCHEDULED_EVALUATOR_KEYS = [
  "operational-day.handoff-overdue",
] as const;

export type ScheduledEvaluationResult = {
  facilitiesScanned: number;
  candidates: number;
  transitions: number;
  reevaluations: number;
  failures: number;
  outboxIds: string[];
  /** False when this pass stopped before every eligible Facility was visited. */
  cycleCompleted?: boolean;
};

export type ScheduledEvaluationControl = {
  deadline: Date;
  owner: string;
  renew(): Promise<boolean>;
};

export type ScheduledEvaluator = {
  key: ScheduledEvaluatorKey;
  evaluate(input: {
    db: ScheduledEvaluationDb;
    now: Date;
    facilityIds?: string[];
    control?: ScheduledEvaluationControl;
  }): Promise<ScheduledEvaluationResult>;
};

export type ScheduledEvaluationRunSummary = ScheduledEvaluationResult & {
  evaluators: number;
  skipped: number;
};
