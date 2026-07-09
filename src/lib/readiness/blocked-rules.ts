import { UnitType } from "@prisma/client";

import type { ReadinessReasonCode, UnitReadinessSignals } from "./types";

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

  if (state === "blocked") {
    if (primary === "failed_logs") {
      return `${signals.failed} failed log${signals.failed === 1 ? "" : "s"} today`;
    }
    if (primary === "missed_logs") {
      return `${signals.missed} missed log${signals.missed === 1 ? "" : "s"} today`;
    }
    if (primary === "urgent_repair") {
      return `${signals.urgentRepairCount} urgent repair${signals.urgentRepairCount === 1 ? "" : "s"} open`;
    }
    if (primary === "high_repair") {
      return `${signals.highRepairCount} high-priority repair${signals.highRepairCount === 1 ? "" : "s"} open`;
    }
    if (primary === "no_staffing") {
      if (signals.unitType === UnitType.SERVERY) {
        return "Servery has no staff coverage";
      }
      return "Kitchen has no staff scheduled";
    }
  }

  if (primary === "pending_logs") {
    return `${signals.pending} log${signals.pending === 1 ? "" : "s"} still due`;
  }
  if (primary === "open_repair") {
    const count = signals.openRepairCount - signals.urgentRepairCount - signals.highRepairCount;
    return `${count} open repair${count === 1 ? "" : "s"}`;
  }
  if (primary === "servery_not_live") {
    return "Meal service not marked live";
  }
  if (primary === "logs_behind") {
    return "Log completion behind expected";
  }

  return "Needs a closer look";
}
