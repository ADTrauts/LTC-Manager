/**
 * Product due-state mapping for Logs (Phase 2 contract).
 * Maps Phase 9C internal EvidenceRequirement states to staff-facing product states.
 */

import type {
  LegacyEvidenceRequirementState,
  LogRequirementProductState,
} from "./types";

export function productStateLabel(state: LogRequirementProductState): string {
  switch (state) {
    case "UPCOMING":
      return "Upcoming";
    case "DUE":
      return "Due";
    case "OVERDUE":
      return "Overdue";
    case "COMPLETED":
      return "Completed";
    case "COMPLETED_WITH_EXCEPTION":
      return "Completed with exception";
    case "NEEDS_SETUP":
      return "Needs setup";
    case "NOT_APPLICABLE":
      return "Not applicable";
  }
}

/**
 * Staff primary state. Supervisor "Needs review" is a secondary flag, not a
 * replacement for Completed with exception.
 */
export function mapEvidenceStateToProductState(
  state: LegacyEvidenceRequirementState,
): {
  productState: LogRequirementProductState;
  needsSupervisorReview: boolean;
} {
  switch (state) {
    case "UPCOMING":
      return { productState: "UPCOMING", needsSupervisorReview: false };
    case "DUE":
      return { productState: "DUE", needsSupervisorReview: false };
    case "NOT_CONFIRMED":
      return { productState: "OVERDUE", needsSupervisorReview: false };
    case "COMPLETED":
      return { productState: "COMPLETED", needsSupervisorReview: false };
    case "COMPLETED_WITH_CORRECTIVE_ACTION":
      return { productState: "COMPLETED_WITH_EXCEPTION", needsSupervisorReview: false };
    case "NEEDS_REVIEW":
      return { productState: "COMPLETED_WITH_EXCEPTION", needsSupervisorReview: true };
    case "NOT_CONFIGURED":
      return { productState: "NEEDS_SETUP", needsSupervisorReview: false };
    case "NOT_APPLICABLE":
      return { productState: "NOT_APPLICABLE", needsSupervisorReview: false };
    case "SAVED_ON_THIS_TABLET":
    case "SYNCHRONIZING":
    case "CONFLICT_REVIEW":
      // Offline transitional — treat as Due until synced; conflict is supervisor-facing.
      return {
        productState: "DUE",
        needsSupervisorReview: state === "CONFLICT_REVIEW",
      };
  }
}

/**
 * Window / cycle temporal progression (pure).
 * Upcoming → Due at window start → Overdue after window end.
 */
export function deriveWindowProductState(input: {
  now: Date;
  windowStartsAt: Date | null;
  windowEndsAt: Date | null;
  isAdHoc: boolean;
}): LogRequirementProductState {
  if (input.isAdHoc) return "DUE";
  if (!input.windowStartsAt || !input.windowEndsAt) return "NEEDS_SETUP";
  if (input.now < input.windowStartsAt) return "UPCOMING";
  if (input.now <= input.windowEndsAt) return "DUE";
  return "OVERDUE";
}
