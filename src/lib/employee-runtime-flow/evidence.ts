/**
 * Harbor evidence projection for Employee Runtime Flow.
 * Maps RLS product states. Does not recalculate due state.
 */

import type { EvidenceRequirement, EvidenceRequirementState } from "@/lib/operational-evidence/types";
import type { LogRequirementProductState } from "@/lib/logs-architecture/types";
import type { RuntimeEvidenceItem, RuntimeLocationState } from "@/lib/runtime-location-state";

import type { EmployeeEvidenceCategory, EmployeeRuntimeEvidenceItem } from "./types";

export function evidenceCategoryForProductState(
  productState: LogRequirementProductState,
  needsSupervisorReview: boolean,
): EmployeeEvidenceCategory | null {
  if (productState === "NOT_APPLICABLE" || productState === "NEEDS_SETUP") return null;
  if (
    productState === "OVERDUE" ||
    productState === "COMPLETED_WITH_EXCEPTION" ||
    needsSupervisorReview
  ) {
    return "needs_attention";
  }
  if (productState === "DUE") return "due_now";
  if (productState === "UPCOMING") return "upcoming";
  if (productState === "COMPLETED") return "completed";
  return null;
}

export function presentHarborEvidenceItem(
  item: RuntimeEvidenceItem,
  spaceId: string,
): EmployeeRuntimeEvidenceItem | null {
  const category = evidenceCategoryForProductState(
    item.productState,
    item.needsSupervisorReview,
  );
  if (!category) return null;
  return {
    attachmentId: item.attachmentId,
    requirementKey: item.requirementKey,
    displayName: item.displayName,
    spaceId,
    productState: item.productState,
    category,
    window: item.window,
    recordId: item.recordId,
    href: item.href,
    catalogStableKey: item.catalogStableKey,
  };
}

export function collectHarborEvidence(
  states: readonly RuntimeLocationState[],
): EmployeeRuntimeEvidenceItem[] {
  const items: EmployeeRuntimeEvidenceItem[] = [];
  for (const state of states) {
    const spaceId = state.identity.location.spaceId;
    for (const item of state.evidence.items) {
      const presented = presentHarborEvidenceItem(item, spaceId);
      if (presented) items.push(presented);
    }
  }
  return items;
}

export function filterTemplateEvidenceToAssignedSpaces(
  requirements: readonly EvidenceRequirement[],
  assignedSpaceIds: ReadonlySet<string> | null,
): EvidenceRequirement[] {
  if (assignedSpaceIds == null) return [...requirements];
  return requirements.filter(
    (row) => row.spaceId == null || assignedSpaceIds.has(row.spaceId),
  );
}

export function mapProductStateToTemplateState(
  productState: LogRequirementProductState,
): { state: EvidenceRequirementState; stateLabel: string } {
  switch (productState) {
    case "OVERDUE":
      return { state: "NOT_CONFIRMED", stateLabel: "Overdue" };
    case "DUE":
      return { state: "DUE", stateLabel: "Due now" };
    case "UPCOMING":
      return { state: "UPCOMING", stateLabel: "Upcoming" };
    case "COMPLETED":
      return { state: "COMPLETED", stateLabel: "Completed" };
    case "COMPLETED_WITH_EXCEPTION":
      return {
        state: "COMPLETED_WITH_CORRECTIVE_ACTION",
        stateLabel: "Completed with exception",
      };
    default:
      return { state: "NOT_APPLICABLE", stateLabel: "Not applicable" };
  }
}
