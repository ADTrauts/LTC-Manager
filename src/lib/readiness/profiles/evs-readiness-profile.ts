import {
  evsActiveRoomReason,
  evsCriticalRoomReason,
} from "@/lib/readiness/evs-room-signals";

import type { ReadinessProfile, ReadinessProfileInput, ReadinessProfileResult } from "./types";

/**
 * EVS readiness — room/area status for the facility-local service date plus
 * staffing and repair signals already available in the readiness batch.
 * Missing room status stays neutral (does not invent Needs Attention).
 */
export function evaluateEvsReadiness(input: ReadinessProfileInput): ReadinessProfileResult {
  const { signals, operationalTime } = input;
  const contributing: ReadinessProfileResult["contributingSignals"] = [];

  if (signals.evsCriticalRoomCondition) {
    const code =
      signals.evsRoomStatus === "TERMINAL_CLEAN_PENDING" ? "evs_terminal_clean" : "evs_isolation";
    contributing.push({
      code,
      detail: evsCriticalRoomReason(signals.evsRoomStatus),
    });
  }

  // Discharge without assigned/active work is treated as needing attention for the current day.
  if (signals.evsDischargePending) {
    const dischargeInProgress =
      signals.assignedSignificantRepairCount > 0 ||
      signals.assignedNormalRepairCount > 0 ||
      signals.staffingCount > 0;
    if (!dischargeInProgress) {
      contributing.push({
        code: "evs_discharge",
        detail: "Discharge cleaning needs attention",
      });
    }
  }

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
      detail: "Priority EVS request is unassigned",
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

  if (signals.evsDischargePending) {
    inProgress.push({
      code: "evs_discharge",
      detail: evsActiveRoomReason("DISCHARGE"),
    });
  } else if (signals.evsActiveCleaning) {
    inProgress.push({
      code: "evs_dirty",
      detail: evsActiveRoomReason("DIRTY"),
    });
  }

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

  const readyReason = signals.evsRoomServiceComplete
    ? "Current cleaning round is complete"
    : "Ready for current EVS coverage";

  return {
    state: "ready",
    primaryReason: readyReason,
    contributingSignals: signals.evsRoomServiceComplete
      ? [{ code: "evs_room_complete", detail: readyReason }]
      : [],
    evaluatedAt: operationalTime.nowUtc,
    profileKey: "EVS",
  };
}

export const evsReadinessProfile: ReadinessProfile = {
  key: "EVS",
  evaluate: evaluateEvsReadiness,
};
