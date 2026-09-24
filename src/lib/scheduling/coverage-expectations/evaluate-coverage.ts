/**
 * Canonical Dietary coverage state.
 *
 * Assigned language only. Never Present / punched-in / on the floor.
 * ScheduleEntry and Team membership never satisfy a slot.
 *
 * Call-down AT_RISK uses the existing AssignmentOverride signal already
 * attached to a filling OperationalAssignment (`hasCallDown`). No new
 * text heuristics. If that field is absent, only partial-fill AT_RISK applies.
 */

import { responsibilityWindowsOverlap } from "@/lib/scheduling/operational-assignments/responsibility-window";
import { isPlanFrontlineVisible } from "@/lib/scheduling/operational-assignments/assignment-plan";

import type {
  CanonicalCoverageState,
  CoverageAssignmentActual,
  CoveragePlanLifecycle,
  ResolvedCoverageExpectation,
} from "./types";

const ELIGIBLE_ASSIGNMENT_STATUSES = new Set(["PLANNED", "ACTIVE"]);

export function planLifecycleFromStatus(
  status: string | null | undefined,
): CoveragePlanLifecycle {
  if (!status) return "MISSING";
  if (status === "DRAFT") return "DRAFT";
  return isPlanFrontlineVisible(status as "CONFIRMED" | "REOPENED" | "CLOSED")
    ? "RUNTIME_VISIBLE"
    : "DRAFT";
}

export function assignmentCoversLocation(
  assignment: CoverageAssignmentActual,
  spaceId: string,
  unitId: string | null,
): boolean {
  if (assignment.coveredSpaceIds.length > 0) {
    return assignment.coveredSpaceIds.includes(spaceId);
  }
  if (!assignment.unitId) return false;
  return Boolean(unitId && assignment.unitId === unitId);
}

export function assignmentOverlapsCycle(input: {
  assignment: CoverageAssignmentActual;
  cycleStartsAt: Date | null;
  cycleEndsAt: Date | null;
}): boolean {
  return responsibilityWindowsOverlap(
    input.assignment.startsAt,
    input.assignment.endsAt,
    input.cycleStartsAt,
    input.cycleEndsAt,
  );
}

export function matchingAssignmentsForSlot(input: {
  expectation: ResolvedCoverageExpectation;
  assignments: readonly CoverageAssignmentActual[];
  spaceId: string;
  unitId: string | null;
  cycleStartsAt: Date | null;
  cycleEndsAt: Date | null;
}): CoverageAssignmentActual[] {
  const seen = new Set<string>();
  const matches: CoverageAssignmentActual[] = [];
  for (const assignment of input.assignments) {
    if (seen.has(assignment.id)) continue;
    if (!ELIGIBLE_ASSIGNMENT_STATUSES.has(assignment.status)) continue;
    if (assignment.roleKey !== input.expectation.roleKey) continue;
    if (!assignmentCoversLocation(assignment, input.spaceId, input.unitId)) continue;
    if (
      !assignmentOverlapsCycle({
        assignment,
        cycleStartsAt: input.cycleStartsAt,
        cycleEndsAt: input.cycleEndsAt,
      })
    ) {
      continue;
    }
    seen.add(assignment.id);
    matches.push(assignment);
  }
  return matches;
}

export function evaluateCoverageSlotState(input: {
  plan: CoveragePlanLifecycle;
  requiredCount: number;
  filledCount: number;
  hasCallDownRisk: boolean;
}): CanonicalCoverageState {
  if (input.plan === "MISSING" || input.plan === "DRAFT") {
    return input.filledCount === 0 ? "NOT_YET_ASSIGNED" : "NOT_CONFIRMED";
  }
  if (input.filledCount <= 0) return "UNCOVERED";
  if (input.filledCount < input.requiredCount) return "AT_RISK";
  if (input.hasCallDownRisk) return "AT_RISK";
  return "COVERED";
}

export type EvaluatedCoverageSlot = {
  expectation: ResolvedCoverageExpectation;
  filledCount: number;
  fillingAssignmentIds: string[];
  state: CanonicalCoverageState;
};

export function evaluateCoverageSlots(input: {
  expectations: readonly ResolvedCoverageExpectation[];
  assignments: readonly CoverageAssignmentActual[];
  spaceId: string;
  unitId: string | null;
  plan: CoveragePlanLifecycle;
  cycleWindows: ReadonlyMap<string, { startsAt: Date | null; endsAt: Date | null }>;
}): EvaluatedCoverageSlot[] {
  return input.expectations.map((expectation) => {
    const window = expectation.cycleStableKey
      ? input.cycleWindows.get(expectation.cycleStableKey)
      : { startsAt: null, endsAt: null };
    const matches = matchingAssignmentsForSlot({
      expectation,
      assignments: input.assignments,
      spaceId: input.spaceId,
      unitId: input.unitId,
      cycleStartsAt: window?.startsAt ?? null,
      cycleEndsAt: window?.endsAt ?? null,
    });
    const filledCount = matches.length;
    const hasCallDownRisk = matches.some((row) => row.hasCallDown === true);
    return {
      expectation,
      filledCount,
      fillingAssignmentIds: matches.map((row) => row.id),
      state: evaluateCoverageSlotState({
        plan: input.plan,
        requiredCount: expectation.requiredCount,
        filledCount,
        hasCallDownRisk,
      }),
    };
  });
}
