import { UnitType } from "@prisma/client";

import type { ReadinessProfile, ReadinessProfileInput, ReadinessProfileResult } from "./types";
import { mealLabelForType } from "./resolve-readiness-profile";

function requiresStaffingCoverage(unitType: UnitType): boolean {
  return unitType === UnitType.SERVERY || unitType === UnitType.KITCHEN;
}

function staffingRoleLabel(unitType: UnitType): string {
  if (unitType === UnitType.SERVERY) return "server";
  if (unitType === UnitType.KITCHEN) return "kitchen staff";
  return "staff";
}

export function evaluateDietaryReadiness(input: ReadinessProfileInput): ReadinessProfileResult {
  const { signals, operationalTime } = input;
  const mealLabel = signals.mealLabel || mealLabelForType(operationalTime.mealType, "meal");
  const contributing: ReadinessProfileResult["contributingSignals"] = [];
  const approachingOrDue =
    operationalTime.hasScheduledStartPassed ||
    operationalTime.operationPhase === "Execution" ||
    (operationalTime.minutesUntilScheduledStart != null &&
      operationalTime.minutesUntilScheduledStart <= 60);

  if (signals.failed > 0) {
    contributing.push({
      code: "failed_logs",
      detail:
        signals.failed === 1
          ? `${mealLabel} critical check failed`
          : `${signals.failed} ${mealLabel.toLowerCase()} critical checks failed`,
    });
  }
  if (signals.missed > 0) {
    contributing.push({
      code: "missed_logs",
      detail:
        signals.missed === 1
          ? `${mealLabel} critical check is overdue`
          : `${signals.missed} ${mealLabel.toLowerCase()} critical checks are overdue`,
    });
  }
  if (signals.urgentRepairCount > 0) {
    const title = signals.primaryUrgentRepairTitle;
    contributing.push({
      code: "urgent_repair",
      detail: title ? `${title} needs attention` : "Urgent equipment issue needs attention",
    });
  }
  if (signals.highRepairCount > 0) {
    const title = signals.primaryHighRepairTitle;
    contributing.push({
      code: "high_repair",
      detail: title ? `${title} needs attention` : "High-priority equipment issue needs attention",
    });
  }
  if (requiresStaffingCoverage(signals.unitType) && signals.staffingCount === 0) {
    contributing.push({
      code: "no_staffing",
      detail: `No ${staffingRoleLabel(signals.unitType)} assigned for ${mealLabel.toLowerCase()}`,
    });
  }

  if (contributing.length > 0) {
    return {
      state: "blocked",
      primaryReason: contributing[0]!.detail,
      contributingSignals: contributing,
      evaluatedAt: operationalTime.nowUtc,
      profileKey: "DIETARY",
    };
  }

  const inProgress: ReadinessProfileResult["contributingSignals"] = [];

  // Future / not-yet-due logs must not create In Progress.
  if (approachingOrDue && signals.pending > 0) {
    inProgress.push({
      code: "pending_logs",
      detail:
        signals.pending === 1
          ? `${mealLabel} check is due now`
          : `${signals.pending} ${mealLabel.toLowerCase()} checks are due now`,
    });
  }

  const lowerPriorityRepairCount =
    signals.openRepairCount - signals.urgentRepairCount - signals.highRepairCount;
  if (lowerPriorityRepairCount > 0) {
    inProgress.push({
      code: "open_repair",
      detail:
        lowerPriorityRepairCount === 1
          ? "Noncritical equipment work remains"
          : `${lowerPriorityRepairCount} noncritical equipment items remain`,
    });
  }

  if (signals.serveryMealNotLive && signals.operationPhase === "Execution") {
    inProgress.push({
      code: "servery_not_live",
      detail: `${mealLabel} service is in progress`,
    });
  } else if (signals.serveryMealNotLive && approachingOrDue) {
    inProgress.push({
      code: "servery_not_live",
      detail: `${mealLabel} setup is in progress`,
    });
  }

  if (inProgress.length > 0) {
    return {
      state: "in_progress",
      primaryReason: inProgress[0]!.detail,
      contributingSignals: inProgress,
      evaluatedAt: operationalTime.nowUtc,
      profileKey: "DIETARY",
    };
  }

  return {
    state: "ready",
    primaryReason: `Ready for ${mealLabel.toLowerCase()}`,
    contributingSignals: [],
    evaluatedAt: operationalTime.nowUtc,
    profileKey: "DIETARY",
  };
}

export const dietaryReadinessProfile: ReadinessProfile = {
  key: "DIETARY",
  evaluate: evaluateDietaryReadiness,
};
