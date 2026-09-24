/**
 * Historical expected-slot presentation states.
 *
 * Live RUN continues to use LogRequirementProductState (Upcoming / Due / Overdue).
 * Closed history must not keep calling an unsubmitted past slot "Overdue" or "Missed".
 */

export type LogHistorySlotState =
  | "UPCOMING"
  | "DUE"
  | "OVERDUE"
  | "COMPLETE"
  | "COMPLETE_WITH_CORRECTIVE_ACTION"
  | "NOT_COMPLETE"
  | "NOT_REQUIRED"
  | "NEEDS_SETUP";

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
    case "NOT_COMPLETE":
      return "Not complete";
    case "NOT_REQUIRED":
      return "Not required";
    case "NEEDS_SETUP":
      return "Needs setup";
  }
}

/**
 * Map a live requirement onto history presentation.
 *
 * Past unsubmitted slots → Not complete (never Missed).
 * Today keeps Due / Upcoming / Overdue while the service date is still live.
 * Future stays Upcoming.
 * Needs setup is not an expected operable slot in history grids.
 */
export function toHistorySlotState(input: {
  liveState: string;
  operationalDateKey: string;
  todayKey: string;
  hasSubmission: boolean;
  submissionHasCorrectiveAction: boolean;
}): LogHistorySlotState {
  if (input.hasSubmission) {
    return input.submissionHasCorrectiveAction
      ? "COMPLETE_WITH_CORRECTIVE_ACTION"
      : "COMPLETE";
  }

  if (input.liveState === "NEEDS_SETUP") return "NEEDS_SETUP";
  if (input.liveState === "NOT_APPLICABLE") return "NOT_REQUIRED";

  if (input.operationalDateKey > input.todayKey) return "UPCOMING";

  if (input.operationalDateKey === input.todayKey) {
    if (input.liveState === "UPCOMING") return "UPCOMING";
    if (input.liveState === "DUE") return "DUE";
    if (input.liveState === "OVERDUE") return "OVERDUE";
    return "DUE";
  }

  return "NOT_COMPLETE";
}
