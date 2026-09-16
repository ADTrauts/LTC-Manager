/**
 * Product-language labels for Shift ↔ Daily Assignment relationship states.
 * Do not expose raw enum names in UI.
 */

import type { ShiftAssignmentRelationship } from "./employee-shift-projection";

export function shiftAssignmentRelationshipLabel(
  relationship: ShiftAssignmentRelationship,
): string {
  switch (relationship) {
    case "SCHEDULED_AND_ASSIGNED":
      return "Assigned";
    case "SCHEDULED_UNASSIGNED":
      return "No daily assignment";
    case "ASSIGNED_UNSCHEDULED":
      return "Assigned, not scheduled";
    case "NEITHER":
      return "Not scheduled";
  }
}

export function formatAssignmentCoverageContext(input: {
  relationship: ShiftAssignmentRelationship;
  scopeSummaryLabels: string[];
}): string | null {
  if (input.relationship === "SCHEDULED_AND_ASSIGNED" || input.relationship === "ASSIGNED_UNSCHEDULED") {
    if (input.scopeSummaryLabels.length === 0) return "Assigned coverage";
    if (input.scopeSummaryLabels.length === 1) return `Assigned: ${input.scopeSummaryLabels[0]}`;
    return `Assigned: ${input.scopeSummaryLabels.slice(0, 2).join("; ")}${
      input.scopeSummaryLabels.length > 2 ? ` +${input.scopeSummaryLabels.length - 2} more` : ""
    }`;
  }
  if (input.relationship === "SCHEDULED_UNASSIGNED") return "No daily assignment";
  return null;
}
