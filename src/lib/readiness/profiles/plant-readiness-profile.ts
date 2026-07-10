import type { ReadinessProfile, ReadinessProfileInput, ReadinessProfileResult } from "./types";

/**
 * Plant readiness v0 — repairs/work-order signals from the existing batch.
 * Ordinary open repairs do not automatically create Needs Attention or In Progress.
 * Asset OUT_OF_SERVICE is not in the readiness batch yet (deferred).
 */
export function evaluatePlantReadiness(input: ReadinessProfileInput): ReadinessProfileResult {
  const { signals, operationalTime } = input;
  const contributing: ReadinessProfileResult["contributingSignals"] = [];

  if (signals.urgentRepairCount > 0) {
    const title = signals.primaryUrgentRepairTitle;
    contributing.push({
      code: "urgent_repair",
      detail: title
        ? `${title} needs attention`
        : "Uncontained urgent equipment failure needs attention",
    });
  }

  if (
    signals.highRepairCount > 0 &&
    (signals.unassignedUrgentOrHighCount > 0 || signals.overdueCriticalRepairCount > 0)
  ) {
    contributing.push({
      code: "high_repair",
      detail: "Urgent work is unassigned or overdue",
    });
  } else if (signals.highRepairCount > 0 && signals.unassignedUrgentOrHighCount === 0) {
    // High priority that is assigned may still need attention if not actively worked —
    // treat uncontained high (not IN_PROGRESS) as Needs Attention.
    if (signals.assignedSignificantRepairCount === 0) {
      const title = signals.primaryHighRepairTitle;
      contributing.push({
        code: "high_repair",
        detail: title ? `${title} needs attention` : "High-priority equipment issue needs attention",
      });
    }
  }

  if (contributing.length > 0) {
    return {
      state: "blocked",
      primaryReason: contributing[0]!.detail,
      contributingSignals: contributing,
      evaluatedAt: operationalTime.nowUtc,
      profileKey: "PLANT",
    };
  }

  const inProgress: ReadinessProfileResult["contributingSignals"] = [];

  if (signals.assignedSignificantRepairCount > 0) {
    inProgress.push({
      code: "open_repair",
      detail: "Priority repair is being worked",
    });
  }

  if (signals.preventiveMaintenanceInProgressCount > 0) {
    inProgress.push({
      code: "open_repair",
      detail: "Preventive maintenance is underway",
    });
  }

  if (inProgress.length > 0) {
    return {
      state: "in_progress",
      primaryReason: inProgress[0]!.detail,
      contributingSignals: inProgress,
      evaluatedAt: operationalTime.nowUtc,
      profileKey: "PLANT",
    };
  }

  // Routine open repairs remain Ready.
  return {
    state: "ready",
    primaryReason: "No critical plant issues for current operations",
    contributingSignals: [],
    evaluatedAt: operationalTime.nowUtc,
    profileKey: "PLANT",
  };
}

export const plantReadinessProfile: ReadinessProfile = {
  key: "PLANT",
  evaluate: evaluatePlantReadiness,
};
