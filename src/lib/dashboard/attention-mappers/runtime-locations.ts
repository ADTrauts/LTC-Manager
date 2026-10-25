import { lookAtHref } from "@/lib/dashboard/runtime/from-runtime-state";
import { exceptionSortRank, type RuntimeLocationState } from "@/lib/runtime-location-state";

import type { AttentionSeverity, DashboardAttentionItem } from "../attention";

/**
 * Ranks 0–2 (uncovered, at-risk coverage or impaired equipment, overdue Records or Key Times)
 * need someone now. A location at risk with no named exception is running late.
 */
export function runtimeLocationSeverity(state: RuntimeLocationState): AttentionSeverity {
  const rank = exceptionSortRank(state.answers.wrong);
  if (rank <= 2) return "act_now";
  if (rank === 3) return "watch";
  return "due_soon";
}

/** One item per location whose pace is at risk; the same set the Dashboard counts as needing attention. */
export function attentionFromRuntimeLocations(
  states: readonly RuntimeLocationState[],
): DashboardAttentionItem[] {
  return states
    .filter((state) => state.answers.pace === "at_risk")
    .map((state) => {
      const { spaceId, unitId, departmentId } = state.identity.location;
      const first = state.answers.wrong[0];
      return {
        id: `location:${spaceId}`,
        source: "location",
        severity: runtimeLocationSeverity(state),
        departmentId,
        locationId: spaceId,
        title: state.identity.displayName,
        detail: first?.label ?? state.answers.happening.label,
        dueAt: null,
        href: unitId ? lookAtHref(first, unitId, spaceId) : "/units",
      };
    });
}
