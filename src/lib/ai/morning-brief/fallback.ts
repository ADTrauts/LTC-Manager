import type { OperationalSnapshot } from "@/lib/ai/operational-snapshot/types";
import type { MorningBriefPriority, MorningBriefResult, MorningBriefUrgency } from "@/lib/ai/types";

import {
  staffingPath,
  todaysWorkCoveragePath,
  todaysWorkHandoffsPath,
  todaysWorkWalkPath,
} from "../operational-snapshot/source-paths";

function urgencyForState(state: string): MorningBriefUrgency {
  if (state === "needs_attention") return "attention";
  if (state === "in_progress") return "in_progress";
  return "monitor";
}

/** Deterministic brief from the same snapshot — never labeled as AI-generated. */
export function buildFallbackMorningBrief(snapshot: OperationalSnapshot): MorningBriefResult {
  const attention = snapshot.priorityLocations.filter((l) => l.state === "needs_attention");
  const inProgress = snapshot.priorityLocations.filter((l) => l.state === "in_progress");
  const ordered = [...attention, ...inProgress, ...snapshot.priorityLocations].filter(
    (loc, index, all) => all.findIndex((x) => x.unitId === loc.unitId) === index,
  );

  const priorities: MorningBriefPriority[] = ordered.slice(0, 3).map((loc) => ({
    title: loc.name,
    reason: loc.primaryReason,
    sourcePath: loc.sourcePath,
    urgency: urgencyForState(loc.state),
  }));

  const watchItems: string[] = [];
  if (snapshot.staffing.gaps > 0) {
    watchItems.push(`${snapshot.staffing.gaps} coverage gap${snapshot.staffing.gaps === 1 ? "" : "s"} on Today's Work.`);
  }
  if (snapshot.staffing.openCallDowns > 0) {
    watchItems.push(
      `${snapshot.staffing.openCallDowns} open call-down${snapshot.staffing.openCallDowns === 1 ? "" : "s"}.`,
    );
  }
  if (snapshot.issues.urgent > 0) {
    watchItems.push(`${snapshot.issues.urgent} urgent issue${snapshot.issues.urgent === 1 ? "" : "s"} still open.`);
  }
  if (snapshot.inspections.overdue > 0 && watchItems.length < 3) {
    watchItems.push(`${snapshot.inspections.overdue} overdue inspection${snapshot.inspections.overdue === 1 ? "" : "s"}.`);
  }

  while (watchItems.length < Math.min(3, priorities.length === 0 ? 1 : 0)) {
    // no-op — keep empty when calm
    break;
  }

  const { needsAttention, inProgress: ip, ready } = snapshot.readiness;
  const op = snapshot.activeOperation.label;

  let headline: string;
  if (needsAttention === 0 && ip === 0) {
    headline = `${op} is generally on track across ${ready} ready location${ready === 1 ? "" : "s"}.`;
  } else if (needsAttention > 0) {
    headline = `${op}: ${needsAttention} location${needsAttention === 1 ? "" : "s"} need attention.`;
  } else {
    headline = `${op}: ${ip} location${ip === 1 ? "" : "s"} in progress.`;
  }

  const summaryParts: string[] = [];
  if (priorities.length > 0) {
    summaryParts.push(
      `Start with ${priorities[0]!.title}: ${priorities[0]!.reason.replace(/\.$/, "")}.`,
    );
  } else {
    summaryParts.push("No Needs Attention locations are currently flagged for the active operation.");
  }
  if (snapshot.staffing.gaps > 0 || snapshot.staffing.openCallDowns > 0) {
    summaryParts.push("Review staffing coverage and call-downs before service.");
  } else if (snapshot.issues.urgent + snapshot.issues.high > 0) {
    summaryParts.push("Open issues remain; monitor recovery before it affects service.");
  } else {
    summaryParts.push("Continue monitoring readiness; routine work can wait.");
  }

  // Ensure watch item paths are grounded even if not listed as priorities
  void todaysWorkWalkPath;
  void todaysWorkCoveragePath;
  void todaysWorkHandoffsPath;
  void staffingPath;

  return {
    headline,
    summary: summaryParts.slice(0, 3).join(" "),
    priorities,
    watchItems: watchItems.slice(0, 3),
    generatedAt: snapshot.generatedAt,
  };
}
