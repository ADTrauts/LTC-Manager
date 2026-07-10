import type { SitePulseSummary } from "@/lib/operations-center/types";

import type { ReadinessSummary } from "./types";

export function buildSitePulseFromReadinessSummary(summary: ReadinessSummary): SitePulseSummary {
  const { ready, inProgress, blocked, total } = summary;
  const attentionCount = blocked + inProgress;

  let headline: string;
  let tone: SitePulseSummary["tone"];

  if (blocked > 0) {
    headline = `Needs Attention — ${blocked} location${blocked === 1 ? "" : "s"} need immediate attention`;
    tone = "blocked";
  } else if (inProgress > 0) {
    headline = `At risk — ${inProgress} location${inProgress === 1 ? "" : "s"} in progress`;
    tone = "at_risk";
  } else if (total === 0) {
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
    locationSummary: `${ready} ready · ${inProgress} in progress · ${blocked} need attention`,
  };
}
