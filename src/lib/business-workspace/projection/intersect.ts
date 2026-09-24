/**
 * Wave 15K — Projection composition config for Business Workspace.
 * Operational intersection of leftover dashboard/readiness inputs is gone.
 */

import type { WorkspaceCompositionConfig } from "../workspace-composition";
import type { WorkspaceSectionId } from "../types";

import type { ProjectedBusinessWorkspaceScope } from "./types";

const ALL_SECTIONS: WorkspaceSectionId[] = [
  "manager_focus",
  "management_agenda",
  "quick_actions",
  "priorities",
  "department_health",
  "todays_work",
  "operations",
  "performance",
  "recent_activity",
];

/**
 * Composition config derived from Projection — replaces department-key COMPOSITIONS
 * as the eligibility source when the Workspace Projection flag is on.
 */
export function resolveProjectedCompositionConfig(
  scope: ProjectedBusinessWorkspaceScope,
): WorkspaceCompositionConfig {
  const label =
    scope.lensMode === "FACILITY"
      ? "Facility Overview"
      : scope.departmentSections[0]?.label ??
        (scope.departmentKey ?? "Workspace");

  const ops = new Set<string>(["oc", "issues", "inspections", "knowledge", "employees"]);
  if (scope.allowedQuickActionIds.includes("assets")) ops.add("assets");
  if (scope.allowedQuickActionIds.includes("logs")) ops.add("logs");
  if (!scope.allowedQuickActionIds.includes("report-issue")) {
    ops.delete("issues");
  }

  return {
    contextLabel: label,
    contextDescription: "Projected operational priorities for this lens.",
    visibleSectionIds: ALL_SECTIONS,
    operationsLinkIds: [...ops],
    todaysWorkLinkIds: ["walk", "coverage", "calldowns", "handoffs"],
    quickActionIds: [...scope.allowedQuickActionIds],
    showLogCompletion: scope.showLogCompletion,
    showMealContext: scope.showMealContext,
  };
}
