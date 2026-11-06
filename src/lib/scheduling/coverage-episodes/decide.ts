/**
 * Coverage episode transitions.
 *
 * The Coverage answer stays derived. This function only decides whether a
 * deficiency incident opens, continues, or closes. OPEN, RESOLVED, and
 * RECOVERED are not Coverage states.
 */

import type { CanonicalCoverageState } from "@/lib/scheduling/coverage-expectations/types";

const ATTENTION = new Set<CanonicalCoverageState>(["AT_RISK", "UNCOVERED"]);

export type CoverageEpisodeDecision =
  | { action: "none" }
  | {
      action: "open";
      toState: "AT_RISK" | "UNCOVERED";
      eventType: "coverage.became_at_risk" | "coverage.became_uncovered";
    }
  | {
      action: "continue";
      toState: "AT_RISK" | "UNCOVERED";
      eventType: "coverage.became_at_risk" | "coverage.became_uncovered";
    }
  | {
      action: "close";
      closeReason: "RESTORED" | "SERVICE_WINDOW_ENDED" | "REQUIREMENT_REMOVED";
      toState: CanonicalCoverageState;
      eventType: "coverage.restored" | null;
    };

function isAttention(state: CanonicalCoverageState | null): state is "AT_RISK" | "UNCOVERED" {
  return state != null && ATTENTION.has(state);
}

function attentionEvent(state: "AT_RISK" | "UNCOVERED"): "coverage.became_at_risk" | "coverage.became_uncovered" {
  return state === "AT_RISK" ? "coverage.became_at_risk" : "coverage.became_uncovered";
}

/**
 * `after` null means the slot is gone. WINDOW_ENDED is not a Coverage answer.
 * The recorder applies it only when the cycle window has already ended.
 */
export function decideCoverageEpisodeTransition(
  before: CanonicalCoverageState | null,
  after: CanonicalCoverageState | "WINDOW_ENDED" | null,
): CoverageEpisodeDecision {
  if (after === "WINDOW_ENDED") {
    if (!isAttention(before)) return { action: "none" };
    return {
      action: "close",
      closeReason: "SERVICE_WINDOW_ENDED",
      toState: before,
      eventType: null,
    };
  }

  if (isAttention(before) && after === "COVERED") {
    return {
      action: "close",
      closeReason: "RESTORED",
      toState: "COVERED",
      eventType: "coverage.restored",
    };
  }

  if (isAttention(before) && (after == null || !isAttention(after))) {
    return {
      action: "close",
      closeReason: "REQUIREMENT_REMOVED",
      toState: after ?? "NOT_APPLICABLE",
      eventType: null,
    };
  }

  if (!isAttention(before) && isAttention(after)) {
    return { action: "open", toState: after, eventType: attentionEvent(after) };
  }

  if (isAttention(before) && isAttention(after) && before !== after) {
    return { action: "continue", toState: after, eventType: attentionEvent(after) };
  }

  return { action: "none" };
}

export function coverageGrainKey(input: {
  facilityId: string;
  serviceDate: string;
  departmentId: string;
  spaceId: string;
  responsibility: string;
  cycleStableKey: string;
}): string {
  return JSON.stringify([
    input.facilityId,
    input.serviceDate,
    input.departmentId,
    input.spaceId,
    input.responsibility,
    input.cycleStableKey,
  ]);
}
