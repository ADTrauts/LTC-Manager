import { evaluateWorkOrderOverdue } from "@/lib/asset-operations/work-order-time-evaluation";
import { evaluateAcknowledgementEscalation } from "@/lib/notifications/escalation";
import { evaluateExternalDelivery } from "@/lib/notifications/external-delivery";
import { evaluateResponsibilityReconciliation } from "@/lib/notifications/responsibility-reconciliation";
import { evaluateKeyPointOverdue } from "@/lib/operational-cycles/key-point-time-evaluation";
import { evaluateCoverageTimeBoundaries } from "@/lib/scheduling/coverage-episodes/time-evaluation";

import type { ScheduledEvaluator, ScheduledEvaluatorKey } from "./types";

export {
  COVERAGE_TIME_EPISODE_BATCH,
  SCHEDULED_EVALUATION_CADENCE_MS,
  SCHEDULED_EVALUATION_FACILITY_BATCH,
  SCHEDULED_EVALUATION_LEASE_MS,
} from "./cadence";

const EVALUATORS: readonly ScheduledEvaluator[] = [
  {
    key: "coverage.time-boundaries",
    evaluate: evaluateCoverageTimeBoundaries,
  },
  {
    key: "key-points.overdue",
    evaluate: evaluateKeyPointOverdue,
  },
  {
    key: "work-orders.overdue",
    evaluate: evaluateWorkOrderOverdue,
  },
  {
    key: "notifications.responsibility-reconciliation",
    evaluate: evaluateResponsibilityReconciliation,
  },
  {
    key: "notifications.escalation",
    evaluate: evaluateAcknowledgementEscalation,
  },
  {
    key: "notifications.external-delivery",
    evaluate: evaluateExternalDelivery,
  },
];

export function listScheduledEvaluators(keys?: readonly ScheduledEvaluatorKey[]): ScheduledEvaluator[] {
  if (!keys) return [...EVALUATORS];
  const wanted = new Set(keys);
  return EVALUATORS.filter((evaluator) => wanted.has(evaluator.key));
}
