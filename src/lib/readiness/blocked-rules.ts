import { UnitType } from "@prisma/client";

import type { ReadinessReasonCode, UnitReadinessSignals } from "./types";

/**
 * Compatibility helpers for legacy callers/tests.
 * New evaluation paths should use department readiness profiles.
 */

export type BlockedRuleEvaluation = {
  blocked: boolean;
  reasonCodes: ReadinessReasonCode[];
};

export function requiresStaffingCoverage(unitType: UnitType): boolean {
  return unitType === UnitType.SERVERY || unitType === UnitType.KITCHEN;
}

export function evaluateBlockedRules(signals: UnitReadinessSignals): BlockedRuleEvaluation {
  const reasonCodes: ReadinessReasonCode[] = [];

  if (signals.failed > 0) {
    reasonCodes.push("failed_logs");
  }
  if (signals.missed > 0) {
    reasonCodes.push("missed_logs");
  }
  if (signals.urgentRepairCount > 0) {
    reasonCodes.push("urgent_repair");
  }
  if (signals.highRepairCount > 0) {
    reasonCodes.push("high_repair");
  }
  if (requiresStaffingCoverage(signals.unitType) && signals.staffingCount === 0) {
    reasonCodes.push("no_staffing");
  }

  return {
    blocked: reasonCodes.length > 0,
    reasonCodes,
  };
}

export function evaluateInProgressRules(signals: UnitReadinessSignals): ReadinessReasonCode[] {
  const reasonCodes: ReadinessReasonCode[] = [];

  if (signals.pending > 0) {
    reasonCodes.push("pending_logs");
  }

  const lowerPriorityRepairCount =
    signals.openRepairCount - signals.urgentRepairCount - signals.highRepairCount;
  if (lowerPriorityRepairCount > 0) {
    reasonCodes.push("open_repair");
  }

  if (signals.serveryMealNotLive && signals.operationPhase === "Execution") {
    reasonCodes.push("servery_not_live");
  }

  if (signals.expected > 0 && signals.completed < signals.expected) {
    reasonCodes.push("logs_behind");
  }

  return reasonCodes;
}

export function resolveReadinessReason(
  signals: UnitReadinessSignals,
  state: "blocked" | "in_progress",
  reasonCodes: ReadinessReasonCode[],
): string {
  const primary = reasonCodes[0];
  const mealLabel = signals.mealLabel || "service";

  if (state === "blocked") {
    if (primary === "failed_logs") {
      return signals.failed === 1
        ? `${mealLabel} critical check failed`
        : `${signals.failed} ${mealLabel.toLowerCase()} critical checks failed`;
    }
    if (primary === "missed_logs") {
      return signals.missed === 1
        ? `${mealLabel} critical check is overdue`
        : `${signals.missed} ${mealLabel.toLowerCase()} critical checks are overdue`;
    }
    if (primary === "urgent_repair") {
      return signals.primaryUrgentRepairTitle
        ? `${signals.primaryUrgentRepairTitle} needs attention`
        : "Urgent equipment issue needs attention";
    }
    if (primary === "high_repair") {
      return signals.primaryHighRepairTitle
        ? `${signals.primaryHighRepairTitle} needs attention`
        : "High-priority equipment issue needs attention";
    }
    if (primary === "no_staffing") {
      if (signals.unitType === UnitType.SERVERY) {
        return `No server assigned for ${mealLabel.toLowerCase()}`;
      }
      return `No kitchen staff assigned for ${mealLabel.toLowerCase()}`;
    }
  }

  if (primary === "pending_logs") {
    return signals.pending === 1
      ? `${mealLabel} check is due now`
      : `${signals.pending} ${mealLabel.toLowerCase()} checks are due now`;
  }
  if (primary === "open_repair") {
    return "Noncritical equipment work remains";
  }
  if (primary === "servery_not_live") {
    return `${mealLabel} setup is in progress`;
  }
  if (primary === "logs_behind") {
    return `${mealLabel} checks still in progress`;
  }

  return "Needs a closer look";
}
