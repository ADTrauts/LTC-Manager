import type { ReadinessProfile, ReadinessProfileInput, ReadinessProfileResult } from "./types";

/**
 * EVS readiness v0 — uses signals already available in the readiness batch
 * (staffing + open repairs). RoomAreaStatus / cleaning-round data is not loaded
 * in the batch today; absent signals stay neutral (do not invent Needs Attention).
 */
export function evaluateEvsReadiness(input: ReadinessProfileInput): ReadinessProfileResult {
  const { signals, operationalTime } = input;
  const contributing: ReadinessProfileResult["contributingSignals"] = [];

  if (signals.urgentRepairCount > 0) {
    const title = signals.primaryUrgentRepairTitle;
    contributing.push({
      code: "urgent_repair",
      detail: title ? `${title} needs attention` : "Critical EVS request needs attention",
    });
  }

  if (signals.overdueCriticalRepairCount > 0) {
    contributing.push({
      code: "high_repair",
      detail: "Priority cleaning request is overdue",
    });
  } else if (signals.unassignedUrgentOrHighCount > 0 && signals.highRepairCount > 0) {
    contributing.push({
      code: "high_repair",
      detail: "High-priority EVS request is unassigned",
    });
  }

  if (signals.requiresEvsCoverage && signals.staffingCount === 0) {
    contributing.push({
      code: "no_staffing",
      detail: "Required EVS coverage is absent",
    });
  }

  if (contributing.length > 0) {
    return {
      state: "blocked",
      primaryReason: contributing[0]!.detail,
      contributingSignals: contributing,
      evaluatedAt: operationalTime.nowUtc,
      profileKey: "EVS",
    };
  }

  const inProgress: ReadinessProfileResult["contributingSignals"] = [];

  if (signals.assignedSignificantRepairCount > 0) {
    inProgress.push({
      code: "open_repair",
      detail: "Assigned cleaning work is in progress",
    });
  } else if (signals.assignedNormalRepairCount > 0) {
    inProgress.push({
      code: "open_repair",
      detail: "EVS request is being worked",
    });
  }

  // Ordinary unassigned open requests do not change readiness.

  if (inProgress.length > 0) {
    return {
      state: "in_progress",
      primaryReason: inProgress[0]!.detail,
      contributingSignals: inProgress,
      evaluatedAt: operationalTime.nowUtc,
      profileKey: "EVS",
    };
  }

  return {
    state: "ready",
    primaryReason: "Ready for current EVS coverage",
    contributingSignals: [],
    evaluatedAt: operationalTime.nowUtc,
    profileKey: "EVS",
  };
}

export const evsReadinessProfile: ReadinessProfile = {
  key: "EVS",
  evaluate: evaluateEvsReadiness,
};
