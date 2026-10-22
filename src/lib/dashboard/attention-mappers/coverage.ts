import { spaceHref } from "@/lib/business-workspace/dashboard/from-runtime-state";
import type { RuntimeLocationState } from "@/lib/runtime-location-state";
import type { CallDownData } from "@/lib/todays-work/call-down";

import { plural, type DashboardAttentionItem } from "../attention";

export function attentionFromCoverage(input: {
  departmentId: string;
  states: readonly RuntimeLocationState[];
  callDowns: CallDownData | null;
}): DashboardAttentionItem[] {
  const items: DashboardAttentionItem[] = [];
  for (const state of input.states) {
    const { spaceId, unitId, departmentId } = state.identity.location;
    if (departmentId !== input.departmentId || state.coverage.availability !== "evaluated") continue;
    const need = state.answers.responsible.need;
    const uncovered = need.filter((row) => row.state === "UNCOVERED");
    const atRisk = need.filter((row) => row.state === "AT_RISK");
    if (uncovered.length === 0 && atRisk.length === 0) continue;
    const parts = [
      ...(uncovered.length > 0 ? [`${plural(uncovered.length, "role")} uncovered`] : []),
      ...(atRisk.length > 0 ? [`${plural(atRisk.length, "role")} at risk`] : []),
    ];
    items.push({
      id: `coverage:${spaceId}`,
      source: "coverage",
      severity: uncovered.length > 0 ? "act_now" : "due_soon",
      departmentId,
      locationId: spaceId,
      title: state.identity.displayName,
      detail: parts.join(" · "),
      dueAt: null,
      href: unitId ? spaceHref(unitId, spaceId, "coverage") : "/staffing/assignments",
    });
  }

  const open = input.callDowns?.summary.open ?? 0;
  if (input.callDowns && open > 0) {
    items.push({
      id: `coverage:call_offs:${input.departmentId}`,
      source: "coverage",
      severity: "act_now",
      departmentId: input.departmentId,
      locationId: null,
      title: `${plural(open, "call-off")} not covered`,
      detail: null,
      dueAt: null,
      href: `/staffing?date=${input.callDowns.dateIso}`,
    });
  }
  return items;
}
