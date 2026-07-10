import type { ReadinessProfile, ReadinessProfileInput, ReadinessProfileResult } from "./types";

/**
 * Conservative neutral profile when department is unknown.
 * Unknown/unavailable signals must not produce Needs Attention.
 */
export function evaluateNeutralReadiness(input: ReadinessProfileInput): ReadinessProfileResult {
  const { signals, operationalTime } = input;

  // Only surface clearly critical equipment that is already marked urgent.
  if (signals.urgentRepairCount > 0) {
    const title = signals.primaryUrgentRepairTitle;
    return {
      state: "blocked",
      primaryReason: title ? `${title} needs attention` : "Urgent issue needs attention",
      contributingSignals: [
        {
          code: "urgent_repair",
          detail: title ? `${title} needs attention` : "Urgent issue needs attention",
        },
      ],
      evaluatedAt: operationalTime.nowUtc,
      profileKey: "NEUTRAL",
    };
  }

  if (signals.assignedSignificantRepairCount > 0) {
    return {
      state: "in_progress",
      primaryReason: "Assigned work is in progress",
      contributingSignals: [
        {
          code: "open_repair",
          detail: "Assigned work is in progress",
        },
      ],
      evaluatedAt: operationalTime.nowUtc,
      profileKey: "NEUTRAL",
    };
  }

  return {
    state: "ready",
    primaryReason: "No current operational exceptions",
    contributingSignals: [],
    evaluatedAt: operationalTime.nowUtc,
    profileKey: "NEUTRAL",
  };
}

export const neutralReadinessProfile: ReadinessProfile = {
  key: "NEUTRAL",
  evaluate: evaluateNeutralReadiness,
};
