import {
  evaluateBlockedRules,
  evaluateInProgressRules,
  resolveReadinessReason,
} from "./blocked-rules";
import type { ReadinessSummary, UnitReadiness, UnitReadinessSignals } from "./types";

export function computeUnitReadiness(signals: UnitReadinessSignals): UnitReadiness {
  const blocked = evaluateBlockedRules(signals);
  if (blocked.blocked) {
    return {
      unitId: signals.unitId,
      unitName: signals.unitName,
      unitType: signals.unitType,
      state: "blocked",
      reason: resolveReadinessReason(signals, "blocked", blocked.reasonCodes),
      reasonCodes: blocked.reasonCodes,
    };
  }

  const inProgressCodes = evaluateInProgressRules(signals);
  if (inProgressCodes.length > 0) {
    return {
      unitId: signals.unitId,
      unitName: signals.unitName,
      unitType: signals.unitType,
      state: "in_progress",
      reason: resolveReadinessReason(signals, "in_progress", inProgressCodes),
      reasonCodes: inProgressCodes,
    };
  }

  return {
    unitId: signals.unitId,
    unitName: signals.unitName,
    unitType: signals.unitType,
    state: "ready",
    reason: "Ready for service",
    reasonCodes: [],
  };
}

export function summarizeReadiness(items: UnitReadiness[]): ReadinessSummary {
  let ready = 0;
  let inProgress = 0;
  let blocked = 0;

  for (const item of items) {
    if (item.state === "blocked") blocked += 1;
    else if (item.state === "in_progress") inProgress += 1;
    else ready += 1;
  }

  return { total: items.length, ready, inProgress, blocked };
}
