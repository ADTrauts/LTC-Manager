/**
 * Shared Cycle → Phase → Key Point semantics over existing PERIOD / KEY_TIME rows.
 * Product/runtime vocabulary only — does not rename persistence.
 *
 * Platform rule:
 * An Operational Cycle is a recurring operational commitment with a duration.
 * Phases are named durations within that Cycle. Key Points are named moments on
 * its timeline. Work may bind to a Cycle or Phase, or remain cycle-free.
 * Key Points are not Work completion or Evidence.
 */

import type { ResolvedCycleOccurrence } from "./types";

/** Root PERIOD (parentStableKey null / depth 0) → Operational Cycle. */
export function isOperationalCycleOccurrence(
  occ: Pick<ResolvedCycleOccurrence, "depth" | "parentStableKey">,
): boolean {
  return occ.depth === 0 || !occ.parentStableKey;
}

/** Nested PERIOD (depth > 0) → Phase within its root Cycle. */
export function isPhaseOccurrence(
  occ: Pick<ResolvedCycleOccurrence, "depth" | "parentStableKey">,
): boolean {
  return occ.depth > 0 || Boolean(occ.parentStableKey);
}

/**
 * Split an active primary PERIOD into Cycle + Phase labels.
 * When only the root is active (no child Phase covers now), phaseLabel is null —
 * that is valid, not a warning.
 */
export function resolveCycleAndPhaseLabels(
  primary: Pick<
    ResolvedCycleOccurrence,
    "label" | "depth" | "ancestorLabels" | "parentStableKey"
  >,
): { cycleLabel: string; phaseLabel: string | null } {
  if (primary.depth > 0 || primary.parentStableKey) {
    return {
      cycleLabel: primary.ancestorLabels[0] ?? primary.label,
      phaseLabel: primary.label,
    };
  }
  return { cycleLabel: primary.label, phaseLabel: null };
}

/** Active Phase labels under the same root Cycle as primary (overlap allowed). */
export function activePhaseLabelsForCycle(
  primary: Pick<ResolvedCycleOccurrence, "label" | "depth" | "ancestorLabels">,
  active: readonly ResolvedCycleOccurrence[],
): string[] {
  const rootLabel =
    primary.depth > 0 ? (primary.ancestorLabels[0] ?? primary.label) : primary.label;
  const phases = active.filter((occ) => {
    if (occ.depth === 0 && occ.hasChildren && occ.expectedMilestones.length === 0) {
      return false;
    }
    const occRoot = occ.depth > 0 ? (occ.ancestorLabels[0] ?? occ.label) : occ.label;
    if (occRoot !== rootLabel) return false;
    return occ.depth > 0 || !occ.hasChildren;
  });
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const phase of phases) {
    if (seen.has(phase.label)) continue;
    seen.add(phase.label);
    labels.push(phase.label);
  }
  return labels;
}

/**
 * Next incomplete Key Point for attention (existing Key Time facts only).
 * Does not invent lateness exceptions or completion.
 */
export function selectNextKeyPointSummary(
  keyPoints: readonly {
    label: string;
    dueLabel: string;
    statusKey: string;
    actualLabel: string | null;
  }[],
): { label: string; dueLabel: string } | null {
  const incomplete = keyPoints.filter((row) => !row.actualLabel);
  const upcoming = incomplete.find((row) => row.statusKey === "upcoming");
  if (upcoming) return { label: upcoming.label, dueLabel: upcoming.dueLabel };
  const due = incomplete.find(
    (row) => row.statusKey === "due" || row.statusKey === "overdue",
  );
  if (due) return { label: due.label, dueLabel: due.dueLabel };
  return incomplete[0]
    ? { label: incomplete[0].label, dueLabel: incomplete[0].dueLabel }
    : null;
}
