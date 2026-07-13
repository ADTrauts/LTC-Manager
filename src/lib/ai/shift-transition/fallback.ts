import type { OperationalSnapshot } from "@/lib/ai/operational-snapshot/types";
import type { OperationalSnapshotDiff } from "@/lib/ai/operational-snapshot/snapshot-diff-types";
import { todaysWorkHandoffsPath } from "@/lib/ai/operational-snapshot/source-paths";

import type { ShiftTransitionResult } from "./types";

function urgencyForState(state: string): "attention" | "in_progress" | "monitor" {
  if (state === "needs_attention") return "attention";
  if (state === "in_progress") return "in_progress";
  return "monitor";
}

/** Deterministic shift transition summary from snapshot + optional diff. */
export function buildFallbackShiftTransition(input: {
  current: OperationalSnapshot;
  diff: OperationalSnapshotDiff;
  contextLabel: string;
}): ShiftTransitionResult {
  const { current, diff, contextLabel } = input;
  const baselineAvailable = diff.baselineAvailable;

  const resolved = diff.items
    .filter((item) => item.direction === "improved")
    .slice(0, 3)
    .map((item) => ({
      text: item.text,
      sourcePath: item.sourcePath,
    }));

  const carryForward = current.priorityLocations
    .filter((loc) => loc.state !== "ready")
    .slice(0, 5)
    .map((loc) => ({
      title: loc.name,
      reason: loc.primaryReason,
      sourcePath: loc.sourcePath,
      urgency: urgencyForState(loc.state),
    }));

  if (carryForward.length === 0 && current.handoffs.length > 0) {
    for (const h of current.handoffs.slice(0, 5 - carryForward.length)) {
      carryForward.push({
        title: h.location,
        reason: h.summary,
        sourcePath: h.sourcePath.startsWith("/") ? h.sourcePath : todaysWorkHandoffsPath(),
        urgency: "monitor",
      });
    }
  }

  const changed = baselineAvailable
    ? diff.items
        .filter((item) => item.direction !== "improved")
        .slice(0, 5)
        .map((item) => ({
          text: item.text,
          direction: item.direction,
          sourcePath: item.sourcePath,
        }))
    : [];

  let title: string;
  let summary: string;

  if (!baselineAvailable) {
    title = `${contextLabel} — current handoff state`;
    if (carryForward.length === 0) {
      summary =
        "No Needs Attention locations are currently flagged. Review Today's Work handoffs if anything new appears.";
    } else {
      summary = `Carry forward ${carryForward.length} unresolved item${carryForward.length === 1 ? "" : "s"} for ${contextLabel}. No comparison baseline was available for this window.`;
    }
  } else {
    title = `${contextLabel} transition`;
    const parts: string[] = [];
    if (resolved.length > 0) {
      parts.push(`${resolved.length} item${resolved.length === 1 ? "" : "s"} improved.`);
    }
    if (carryForward.length > 0) {
      parts.push(
        `Carry forward starts with ${carryForward[0]!.title}: ${carryForward[0]!.reason.replace(/\.$/, "")}.`,
      );
    } else {
      parts.push("No open Needs Attention locations remain.");
    }
    if (changed.length > 0) {
      parts.push("See what changed for additional movement during the window.");
    } else if (parts.length < 2) {
      parts.push("Operational state was largely stable across the comparison window.");
    }
    summary = parts.slice(0, 3).join(" ");
  }

  return {
    title,
    summary,
    resolved,
    carryForward,
    changed,
    generatedAt: current.generatedAt,
    baselineAvailable,
  };
}
