/**
 * Derive room / UnitSpace Work summary from Work Requirements (Phase 11B).
 *
 * WORK_COMPLETE means configured EVS Work confirmed — not clinical/safety certification.
 * No competing RoomAreaStatus / cleaningStatus source of truth.
 */

import type { WorkRequirement, WorkRequirementState } from "./types";

export type SpaceWorkSummaryState =
  | "UPCOMING"
  | "WORK_DUE"
  | "IN_PROGRESS"
  | "WORK_COMPLETE"
  | "NEEDS_REVIEW"
  | "REWORK_REQUIRED"
  | "PAST_DUE_NOT_CONFIRMED"
  | "NOT_REQUIRED"
  | "NOT_APPLICABLE"
  | "NOT_CONFIGURED"
  | "SAVED_ON_THIS_TABLET"
  | "CONFLICT_REVIEW";

const COMPLETE_STATES: ReadonlySet<WorkRequirementState> = new Set([
  "COMPLETED",
  "COMPLETED_WITH_EVIDENCE",
  "NOT_REQUIRED",
]);

const INCOMPLETE_STATES: ReadonlySet<WorkRequirementState> = new Set([
  "UPCOMING",
  "DUE",
  "CURRENT",
  "PAST_DUE_NOT_CONFIRMED",
  "SAVED_ON_THIS_TABLET",
  "SYNCHRONIZING",
  "CONFLICT_REVIEW",
  "REASSIGNED",
  "NOT_CONFIGURED",
]);

const LABELS: Record<SpaceWorkSummaryState, string> = {
  UPCOMING: "Upcoming",
  WORK_DUE: "Work due",
  IN_PROGRESS: "In progress",
  WORK_COMPLETE: "Work complete",
  NEEDS_REVIEW: "Needs review",
  REWORK_REQUIRED: "Rework required",
  PAST_DUE_NOT_CONFIRMED: "Past due — not confirmed",
  NOT_REQUIRED: "Not required",
  NOT_APPLICABLE: "Not applicable",
  NOT_CONFIGURED: "Not configured",
  SAVED_ON_THIS_TABLET: "Saved on this tablet",
  CONFLICT_REVIEW: "Conflict — review needed",
};

function isRequiredRequirement(state: WorkRequirementState): boolean {
  return state !== "NOT_APPLICABLE";
}

/**
 * Deterministic priority summary for a single spaceId among derived requirements.
 * WORK_COMPLETE = configured Work confirmed; not clinical or infection-control certification.
 */
export function deriveSpaceWorkSummary(input: {
  spaceId: string;
  requirements: readonly WorkRequirement[];
  needsReviewSpaceIds?: readonly string[];
  reworkRequiredSpaceIds?: readonly string[];
}): {
  spaceId: string;
  state: SpaceWorkSummaryState;
  completedCount: number;
  totalCount: number;
  label: string;
} {
  const forSpace = input.requirements.filter((r) => r.spaceId === input.spaceId);
  const needsReview = (input.needsReviewSpaceIds ?? []).includes(input.spaceId);
  const reworkRequired = (input.reworkRequiredSpaceIds ?? []).includes(input.spaceId);

  const required = forSpace.filter((r) => isRequiredRequirement(r.state));
  const completedCount = required.filter((r) => COMPLETE_STATES.has(r.state)).length;
  const totalCount = required.length;

  const finish = (state: SpaceWorkSummaryState) => ({
    spaceId: input.spaceId,
    state,
    completedCount,
    totalCount,
    label: LABELS[state],
  });

  if (forSpace.some((r) => r.state === "CONFLICT_REVIEW")) {
    return finish("CONFLICT_REVIEW");
  }
  if (forSpace.some((r) => r.state === "SAVED_ON_THIS_TABLET")) {
    return finish("SAVED_ON_THIS_TABLET");
  }
  if (needsReview) {
    return finish("NEEDS_REVIEW");
  }
  if (reworkRequired) {
    return finish("REWORK_REQUIRED");
  }
  if (forSpace.length === 0) {
    return finish("NOT_CONFIGURED");
  }
  if (forSpace.every((r) => r.state === "NOT_APPLICABLE")) {
    return finish("NOT_APPLICABLE");
  }

  const incomplete = required.filter((r) => INCOMPLETE_STATES.has(r.state));
  if (
    required.length > 0 &&
    incomplete.length === 0 &&
    required.every((r) => r.state === "NOT_REQUIRED")
  ) {
    return finish("NOT_REQUIRED");
  }

  if (
    required.length > 0 &&
    incomplete.length === 0 &&
    required.every((r) => COMPLETE_STATES.has(r.state))
  ) {
    return finish("WORK_COMPLETE");
  }

  if (completedCount > 0 && incomplete.length > 0) {
    return finish("IN_PROGRESS");
  }

  if (incomplete.some((r) => r.state === "PAST_DUE_NOT_CONFIRMED")) {
    return finish("PAST_DUE_NOT_CONFIRMED");
  }

  if (incomplete.some((r) => r.state === "DUE" || r.state === "CURRENT")) {
    return finish("WORK_DUE");
  }

  return finish("UPCOMING");
}
