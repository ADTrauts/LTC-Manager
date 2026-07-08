import { UnitType } from "@prisma/client";

import type { OperationsCenterUnitCard, SitePulseSummary } from "./types";

export type LocationPulseBucket = "ready" | "in_progress" | "blocked";

export function classifyUnitPulseStatus(unit: OperationsCenterUnitCard): LocationPulseBucket {
  const blocked =
    unit.failed > 0 ||
    unit.missed > 0 ||
    (unit.unitType === UnitType.SERVERY && unit.staffingCount === 0);

  if (blocked) return "blocked";

  const inProgress =
    unit.pending > 0 ||
    unit.openRepairCount > 0 ||
    unit.staffingCount === 0 ||
    (unit.expected > 0 && unit.completed < unit.expected);

  if (inProgress) return "in_progress";

  return "ready";
}

export function computeSitePulse(unitCards: OperationsCenterUnitCard[]): SitePulseSummary {
  let ready = 0;
  let inProgress = 0;
  let blocked = 0;

  for (const unit of unitCards) {
    const bucket = classifyUnitPulseStatus(unit);
    if (bucket === "blocked") blocked += 1;
    else if (bucket === "in_progress") inProgress += 1;
    else ready += 1;
  }

  const attentionCount = blocked + inProgress;
  let headline: string;
  let tone: SitePulseSummary["tone"];

  if (blocked > 0) {
    headline = `Blocked — ${blocked} location${blocked === 1 ? "" : "s"} need immediate attention`;
    tone = "blocked";
  } else if (inProgress > 0) {
    headline = `At risk — ${inProgress} location${inProgress === 1 ? "" : "s"} need attention`;
    tone = "at_risk";
  } else if (unitCards.length === 0) {
    headline = "No active locations configured";
    tone = "neutral";
  } else {
    headline = "Healthy — operations on track";
    tone = "healthy";
  }

  return {
    headline,
    tone,
    ready,
    inProgress,
    blocked,
    attentionCount,
    locationSummary: `${ready} ready · ${inProgress} in progress · ${blocked} blocked`,
  };
}
