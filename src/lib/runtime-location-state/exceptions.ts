/**
 * Derived Runtime Location State exceptions.
 * Presentation-only. Not persisted. Not a severity score.
 */

import type {
  RuntimeException,
  RuntimeLocationState,
} from "./types";

const AFFECTING_IMPACTS = new Set(["SERVICE_AT_RISK", "EQUIPMENT_UNAVAILABLE"]);

export function deriveRuntimeExceptions(
  state: Pick<
    RuntimeLocationState,
    "identity" | "program" | "operation" | "coverage" | "evidence" | "assets" | "milestones"
  >,
): RuntimeException[] {
  const location = state.identity.location;
  const operationalContext = {
    cycleStableKey: state.operation.current?.cycleStableKey ?? null,
    operationalTypeKey: state.program.operationalType.key,
  };
  const exceptions: RuntimeException[] = [];

  if (state.coverage.availability === "evaluated") {
    for (const slot of state.coverage.slots) {
      if (slot.state !== "UNCOVERED" && slot.state !== "AT_RISK") continue;
      exceptions.push({
        source: "coverage",
        state: slot.state,
        location,
        operationalContext: {
          ...operationalContext,
          cycleStableKey: slot.cycleStableKey ?? operationalContext.cycleStableKey,
        },
        label:
          slot.state === "UNCOVERED"
            ? `${slot.roleLabel} uncovered`
            : `${slot.roleLabel} at risk`,
        href: null,
      });
    }
  }

  for (const item of state.evidence.items) {
    if (item.productState === "OVERDUE") {
      exceptions.push({
        source: "evidence",
        state: item.productState,
        location,
        operationalContext: {
          ...operationalContext,
          cycleStableKey: item.cycleStableKey ?? operationalContext.cycleStableKey,
        },
        label: `${item.displayName} overdue`,
        href: item.href,
      });
    }
    if (item.productState === "COMPLETED_WITH_EXCEPTION") {
      exceptions.push({
        source: "corrective_action",
        state: item.productState,
        location,
        operationalContext: {
          ...operationalContext,
          cycleStableKey: item.cycleStableKey ?? operationalContext.cycleStableKey,
        },
        label: `${item.displayName} completed with exception`,
        href: item.href,
      });
    }
  }

  for (const milestone of state.milestones.items) {
    if (!milestone.canonical) continue;
    if (milestone.statusKey === "overdue") {
      exceptions.push({
        source: "milestone",
        state: milestone.statusKey,
        location,
        operationalContext,
        label: `${milestone.label} overdue`,
        href: null,
      });
    }
    if (milestone.statusKey === "completed_late") {
      exceptions.push({
        source: "milestone",
        state: milestone.statusKey,
        location,
        operationalContext,
        label: `${milestone.label} completed late`,
        href: null,
      });
    }
  }

  for (const issue of state.assets.issuesAffectingOperation) {
    if (!AFFECTING_IMPACTS.has(issue.impact)) continue;
    exceptions.push({
      source: "asset_issue",
      state: issue.impact,
      location,
      operationalContext,
      label: issue.summary,
      href: issue.href,
    });
  }

  return exceptions;
}

export function exceptionSortRank(exceptions: readonly RuntimeException[]): number {
  if (exceptions.some((row) => row.source === "coverage" && row.state === "UNCOVERED")) {
    return 0;
  }
  if (
    exceptions.some(
      (row) =>
        (row.source === "coverage" && row.state === "AT_RISK") ||
        (row.source === "asset_issue" &&
          (row.state === "SERVICE_AT_RISK" || row.state === "EQUIPMENT_UNAVAILABLE")),
    )
  ) {
    return 1;
  }
  if (
    exceptions.some(
      (row) =>
        (row.source === "evidence" && row.state === "OVERDUE") ||
        (row.source === "milestone" && row.state === "overdue"),
    )
  ) {
    return 2;
  }
  if (exceptions.length > 0) return 3;
  return 4;
}
