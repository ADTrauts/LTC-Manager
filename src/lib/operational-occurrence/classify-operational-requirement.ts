/**
 * One derived occurrence for an expected requirement.
 * Review and formal reports aggregate this state. They do not recount it.
 *
 * A past service date with no evidence and no waiver is NOT_COMPLETE (missed).
 * The same window, still on today's service date, stays OVERDUE and can still be recorded.
 * Evidence outranks a waiver. A waiver alone is not completed work.
 */

export type OperationalOccurrenceState =
  | "UPCOMING"
  | "DUE"
  | "OVERDUE"
  | "COMPLETE"
  | "COMPLETE_WITH_CORRECTIVE_ACTION"
  | "NEEDS_REVIEW"
  | "NOT_COMPLETE"
  | "WAIVED"
  | "NEEDS_SETUP"
  | "NOT_REQUIRED";

export type OperationalOccurrenceSummary = {
  expected: number;
  completed: number;
  missed: number;
  overdue: number;
  waived: number;
  upcoming: number;
  due: number;
  needsSetup: number;
  notRequired: number;
  exceptions: number;
  needsReview: number;
};

const COMPLETED = new Set<OperationalOccurrenceState>([
  "COMPLETE",
  "COMPLETE_WITH_CORRECTIVE_ACTION",
  "NEEDS_REVIEW",
]);

export function classifyOperationalRequirement(input: {
  liveState: string;
  serviceDate: string;
  todayKey: string;
  hasEvidence: boolean;
  evidenceStatus?: string | null;
  outOfStandard?: boolean;
  hasCorrectiveAction?: boolean;
  hasWaiver: boolean;
}): OperationalOccurrenceState {
  if (input.hasEvidence) {
    if (input.evidenceStatus === "NEEDS_REVIEW") return "NEEDS_REVIEW";
    if (
      input.evidenceStatus === "COMPLETED_WITH_CORRECTIVE_ACTION" ||
      input.hasCorrectiveAction === true ||
      input.outOfStandard === true
    ) {
      return "COMPLETE_WITH_CORRECTIVE_ACTION";
    }
    return "COMPLETE";
  }
  if (input.hasWaiver) return "WAIVED";
  if (input.liveState === "NEEDS_SETUP" || input.liveState === "NOT_CONFIGURED") return "NEEDS_SETUP";
  if (input.liveState === "NOT_APPLICABLE") return "NOT_REQUIRED";
  if (input.serviceDate > input.todayKey) return "UPCOMING";
  if (input.serviceDate === input.todayKey) {
    if (input.liveState === "UPCOMING") return "UPCOMING";
    if (input.liveState === "OVERDUE" || input.liveState === "NOT_CONFIRMED") return "OVERDUE";
    return "DUE";
  }
  return "NOT_COMPLETE";
}

export function operationalOccurrenceLabel(state: OperationalOccurrenceState): string {
  switch (state) {
    case "UPCOMING":
      return "Upcoming";
    case "DUE":
      return "Due";
    case "OVERDUE":
      return "Overdue";
    case "COMPLETE":
      return "Completed";
    case "COMPLETE_WITH_CORRECTIVE_ACTION":
      return "Completed with corrective action";
    case "NEEDS_REVIEW":
      return "Needs review";
    case "NOT_COMPLETE":
      return "Missed";
    case "WAIVED":
      return "Waived";
    case "NEEDS_SETUP":
      return "Needs setup";
    case "NOT_REQUIRED":
      return "Not required";
  }
}

export function occurrenceContributesInspectionScore(state: OperationalOccurrenceState): boolean {
  return COMPLETED.has(state);
}

export function summarizeOperationalOccurrences(
  states: readonly OperationalOccurrenceState[],
): OperationalOccurrenceSummary {
  const summary: OperationalOccurrenceSummary = {
    expected: 0,
    completed: 0,
    missed: 0,
    overdue: 0,
    waived: 0,
    upcoming: 0,
    due: 0,
    needsSetup: 0,
    notRequired: 0,
    exceptions: 0,
    needsReview: 0,
  };
  for (const state of states) {
    if (state === "NEEDS_SETUP") {
      summary.needsSetup += 1;
      continue;
    }
    if (state === "NOT_REQUIRED") {
      summary.notRequired += 1;
      continue;
    }
    summary.expected += 1;
    if (COMPLETED.has(state)) summary.completed += 1;
    if (state === "NOT_COMPLETE") summary.missed += 1;
    if (state === "OVERDUE") summary.overdue += 1;
    if (state === "WAIVED") summary.waived += 1;
    if (state === "UPCOMING") summary.upcoming += 1;
    if (state === "DUE") summary.due += 1;
    if (state === "COMPLETE_WITH_CORRECTIVE_ACTION") summary.exceptions += 1;
    if (state === "NEEDS_REVIEW") summary.needsReview += 1;
  }
  return summary;
}

export function formatOccurrenceSummaryLine(
  label: string,
  summary: Pick<OperationalOccurrenceSummary, "completed" | "expected" | "missed" | "overdue" | "waived">,
  extra = "",
): string {
  const overdue = summary.overdue > 0 ? ` · overdue ${summary.overdue}` : "";
  const waived = summary.waived > 0 ? ` · waived ${summary.waived}` : "";
  return `${label}: completed ${summary.completed}/${summary.expected} · missed ${summary.missed}${overdue}${waived}${extra}`;
}

/**
 * Review stores a lowercase rename of the canonical state.
 * `unavailable` is a reconstruction gap, not a staff miss.
 */
export function occurrenceFromReviewEvidenceState(state: string): OperationalOccurrenceState | null {
  switch (state) {
    case "completed":
      return "COMPLETE";
    case "completed_with_corrective_action":
      return "COMPLETE_WITH_CORRECTIVE_ACTION";
    case "needs_review":
      return "NEEDS_REVIEW";
    case "not_complete":
      return "NOT_COMPLETE";
    case "overdue":
      return "OVERDUE";
    case "waived":
      return "WAIVED";
    case "upcoming":
      return "UPCOMING";
    case "due":
      return "DUE";
    case "needs_setup":
      return "NEEDS_SETUP";
    case "not_required":
      return "NOT_REQUIRED";
    default:
      return null;
  }
}

export function reviewEvidenceStateFromOccurrence(
  state: OperationalOccurrenceState,
):
  | "completed"
  | "completed_with_corrective_action"
  | "needs_review"
  | "not_complete"
  | "overdue"
  | "waived"
  | "upcoming"
  | "due"
  | "needs_setup"
  | "not_required" {
  switch (state) {
    case "COMPLETE":
      return "completed";
    case "COMPLETE_WITH_CORRECTIVE_ACTION":
      return "completed_with_corrective_action";
    case "NEEDS_REVIEW":
      return "needs_review";
    case "NOT_COMPLETE":
      return "not_complete";
    case "OVERDUE":
      return "overdue";
    case "WAIVED":
      return "waived";
    case "UPCOMING":
      return "upcoming";
    case "DUE":
      return "due";
    case "NEEDS_SETUP":
      return "needs_setup";
    case "NOT_REQUIRED":
      return "not_required";
  }
}
