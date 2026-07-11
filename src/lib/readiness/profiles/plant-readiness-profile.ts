import {
  plantActiveRepairReason,
  plantOutOfServiceReason,
  plantOverduePmReason,
} from "@/lib/readiness/plant-asset-signals";

import type { ReadinessProfile, ReadinessProfileInput, ReadinessProfileResult } from "./types";

/**
 * Plant readiness — asset availability, PM due/overdue for the facility-local
 * service window, and repair lifecycle signals from the readiness batch.
 *
 * No asset criticality field exists; OUT_OF_SERVICE plus repair priority are
 * used conservatively. Future PM (beyond today) is excluded from batch loading.
 */
export function evaluatePlantReadiness(input: ReadinessProfileInput): ReadinessProfileResult {
  const { signals, operationalTime } = input;
  const contributing: ReadinessProfileResult["contributingSignals"] = [];

  if (signals.outOfServiceAssetCount > 0) {
    contributing.push({
      code: "plant_out_of_service",
      detail: plantOutOfServiceReason(signals.primaryOutOfServiceAssetName),
    });
  }

  if (signals.overduePmScheduleCount > 0) {
    contributing.push({
      code: "plant_pm_overdue",
      detail: plantOverduePmReason(signals.primaryOverduePmName),
    });
  }

  const urgentNeedsAttention =
    signals.urgentNotActivelyWorkedCount > 0 ||
    (signals.urgentRepairCount > 0 && signals.significantActivelyWorkedCount === 0);

  if (urgentNeedsAttention) {
    const title = signals.primaryUrgentRepairTitle;
    const unassignedUrgent =
      signals.unassignedUrgentOrHighCount > 0 && signals.urgentRepairCount > 0;
    contributing.push({
      code: "urgent_repair",
      detail: title
        ? `${title} needs attention`
        : unassignedUrgent
          ? "Urgent repair is unassigned"
          : "Uncontained urgent equipment failure needs attention",
    });
  }

  if (signals.overdueCriticalRepairCount > 0 && signals.highRepairCount > 0) {
    contributing.push({
      code: "high_repair",
      detail: "Priority repair is overdue",
    });
  } else if (
    signals.unassignedUrgentOrHighCount > 0 &&
    signals.highRepairCount > 0 &&
    signals.urgentRepairCount === 0
  ) {
    contributing.push({
      code: "high_repair",
      detail: "Urgent repair is unassigned",
    });
  } else if (
    signals.highRepairCount > 0 &&
    signals.assignedSignificantRepairCount === 0 &&
    signals.significantActivelyWorkedCount === 0 &&
    signals.urgentRepairCount === 0
  ) {
    const title = signals.primaryHighRepairTitle;
    contributing.push({
      code: "high_repair",
      detail: title ? `${title} needs attention` : "High-priority equipment issue needs attention",
    });
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

  if (signals.significantActivelyWorkedCount > 0) {
    inProgress.push({
      code: "open_repair",
      detail: plantActiveRepairReason(signals.primarySignificantInProgressTitle),
    });
  } else if (signals.assignedSignificantRepairCount > 0) {
    inProgress.push({
      code: "open_repair",
      detail: plantActiveRepairReason(
        signals.primaryHighRepairTitle ?? signals.primaryUrgentRepairTitle,
      ),
    });
  }

  if (signals.pmDueTodayUnderwayCount > 0 || signals.preventiveMaintenanceInProgressCount > 0) {
    inProgress.push({
      code: "plant_pm_due",
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

  return {
    state: "ready",
    primaryReason: "No critical equipment issues",
    contributingSignals: [],
    evaluatedAt: operationalTime.nowUtc,
    profileKey: "PLANT",
  };
}

export const plantReadinessProfile: ReadinessProfile = {
  key: "PLANT",
  evaluate: evaluatePlantReadiness,
};
