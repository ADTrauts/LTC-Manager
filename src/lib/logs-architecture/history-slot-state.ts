/**
 * Historical expected-slot states.
 * Classification lives in classifyOperationalRequirement.
 * A closed service date is NOT_COMPLETE. The same day still open is OVERDUE.
 */

import {
  classifyOperationalRequirement,
  type OperationalOccurrenceState,
} from "@/lib/operational-occurrence/classify-operational-requirement";

export type LogHistorySlotState = OperationalOccurrenceState;

export function historySlotStateLabel(state: LogHistorySlotState): string {
  switch (state) {
    case "UPCOMING":
      return "Upcoming";
    case "DUE":
      return "Due";
    case "OVERDUE":
      return "Overdue";
    case "COMPLETE":
      return "Complete";
    case "COMPLETE_WITH_CORRECTIVE_ACTION":
      return "Complete with corrective action";
    case "NEEDS_REVIEW":
      return "Needs review";
    case "NOT_COMPLETE":
      return "Not complete";
    case "WAIVED":
      return "Waived";
    case "NOT_REQUIRED":
      return "Not required";
    case "NEEDS_SETUP":
      return "Needs setup";
  }
}

/**
 * Map a live requirement onto history presentation.
 * Delegates to classifyOperationalRequirement. This path has no waiver.
 */
export function toHistorySlotState(input: {
  liveState: string;
  operationalDateKey: string;
  todayKey: string;
  hasSubmission: boolean;
  submissionHasCorrectiveAction: boolean;
}): LogHistorySlotState {
  return classifyOperationalRequirement({
    liveState: input.liveState,
    serviceDate: input.operationalDateKey,
    todayKey: input.todayKey,
    hasEvidence: input.hasSubmission,
    evidenceStatus: input.hasSubmission
      ? input.submissionHasCorrectiveAction
        ? "COMPLETED_WITH_CORRECTIVE_ACTION"
        : "COMPLETED"
      : null,
    hasWaiver: false,
  });
}
