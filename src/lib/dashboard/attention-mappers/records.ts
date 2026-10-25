import { spaceHref } from "@/lib/dashboard/runtime/from-runtime-state";
import type { RecordEngineMode } from "@/lib/canonical-logs/record-engine-rollout";
import type { RunLogRequirementView } from "@/lib/canonical-logs/run-presentation";
import type { LogRequirementProductState } from "@/lib/logs-architecture/types";
import type { RuntimeLocationState } from "@/lib/runtime-location-state";

import type { AttentionSeverity, DashboardAttentionItem } from "../attention";

export function recordSeverity(
  productState: LogRequirementProductState,
  needsSupervisorReview: boolean,
): AttentionSeverity | null {
  if (productState === "OVERDUE") return "act_now";
  if (productState === "DUE") return "due_soon";
  if (productState === "COMPLETED_WITH_EXCEPTION" || needsSupervisorReview) return "watch";
  return null;
}

/** Location evidence first; requirements without a location item follow. Legacy Records produce nothing. */
export function attentionFromRecords(input: {
  departmentId: string;
  engine: RecordEngineMode;
  states: readonly RuntimeLocationState[];
  requirements: readonly RunLogRequirementView[];
}): DashboardAttentionItem[] {
  if (input.engine !== "CANONICAL") return [];
  const items: DashboardAttentionItem[] = [];
  const seen = new Set<string>();

  for (const state of input.states) {
    const { spaceId, unitId, departmentId } = state.identity.location;
    if (departmentId !== input.departmentId) continue;
    for (const evidence of state.evidence.items) {
      const severity = recordSeverity(evidence.productState, evidence.needsSupervisorReview);
      if (!severity || seen.has(evidence.requirementKey)) continue;
      seen.add(evidence.requirementKey);
      items.push({
        id: `records:${evidence.requirementKey}`,
        source: "records",
        severity,
        departmentId,
        locationId: spaceId,
        title: evidence.displayName,
        detail: state.identity.displayName,
        dueAt: null,
        href: evidence.href ?? (unitId ? spaceHref(unitId, spaceId, "evidence") : "/staffing/log-book"),
      });
    }
  }

  for (const requirement of input.requirements) {
    if (requirement.departmentId !== input.departmentId || seen.has(requirement.requirementKey)) continue;
    const severity = recordSeverity(requirement.productState, false);
    if (!severity) continue;
    seen.add(requirement.requirementKey);
    items.push({
      id: `records:${requirement.requirementKey}`,
      source: "records",
      severity,
      departmentId: requirement.departmentId,
      locationId: null,
      title: requirement.displayName,
      detail: requirement.targetLabel,
      dueAt: requirement.windowEndsAt,
      href: requirement.openHref ?? requirement.viewRecordHref ?? "/staffing/log-book",
    });
  }
  return items;
}
