/**
 * Runtime Location State answers — one derived projection of today.
 *
 * Happening, responsible, open cycle, pace, evidence due, wrong, next.
 * Not a health score. Not the deferred readiness engine. Not a card.
 */

import { locationProgramIsAttached } from "@/lib/department-administration/location-program";
import type { CanonicalCoverageState } from "@/lib/scheduling/coverage-expectations";

import type {
  RuntimeException,
  RuntimeLocationState,
  RuntimeNextEvent,
} from "./types";

export const HAPPENING_NONE_LABEL = "No active operation";
export const HAPPENING_UNPROGRAMMED_LABEL = "Location Program not attached";

export type RuntimeHappeningState = "active" | "none" | "unprogrammed";
export type RuntimePace = "ready" | "on_time" | "at_risk" | "idle";

export type RuntimeResponsiblePerson = {
  assignmentId: string;
  employeeId: string | null;
  employeeDisplayName: string | null;
  slotLabel: string;
};

export type RuntimeResponsibleNeed = {
  teamId: string | null;
  teamName: string;
  requiredCount: number;
  filledCount: number;
  state: CanonicalCoverageState;
  cycleStableKey: string | null;
};

export type RuntimeEvidenceDueItem = {
  requirementKey: string;
  label: string;
  href: string | null;
};

export type RuntimeLocationAnswers = {
  happening: {
    state: RuntimeHappeningState;
    label: string;
  };
  responsible: {
    teams: Array<{ id: string; name: string }>;
    assigned: RuntimeResponsiblePerson[];
    need: RuntimeResponsibleNeed[];
  };
  cycle: {
    open: {
      cycleStableKey: string;
      label: string;
      window: { start: string | null; end: string | null };
    } | null;
    upcoming: {
      cycleStableKey: string;
      label: string;
      startsAt: string | null;
      minutesUntil: number | null;
    } | null;
  };
  pace: RuntimePace;
  evidenceDue: {
    dueNow: RuntimeEvidenceDueItem[];
    overdue: RuntimeEvidenceDueItem[];
    upcoming: RuntimeEvidenceDueItem[];
  };
  wrong: RuntimeException[];
  next: RuntimeNextEvent | null;
};

export type RuntimeLocationAnswersInput = Omit<RuntimeLocationState, "answers">;

function teamIdFromRoleKey(roleKey: string): string | null {
  return roleKey.startsWith("TEAM:") ? roleKey.slice("TEAM:".length) : null;
}

function evidenceDueItem(
  state: RuntimeLocationAnswersInput,
  requirementKey: string,
): RuntimeEvidenceDueItem {
  const item = state.evidence.items.find((row) => row.requirementKey === requirementKey);
  return {
    requirementKey,
    label: item?.displayName ?? requirementKey,
    href: item?.href ?? null,
  };
}

function applicableSlots(state: RuntimeLocationAnswersInput) {
  return state.coverage.slots.filter((slot) => slot.state !== "NOT_APPLICABLE");
}

function hasProblem(state: RuntimeLocationAnswersInput): boolean {
  if (state.exceptions.length > 0) return true;
  if (state.evidence.overdue.length > 0) return true;
  if (state.evidence.correctiveOpen.length > 0) return true;
  if (state.assets.issuesAffectingOperation.length > 0) return true;
  if (
    applicableSlots(state).some(
      (slot) => slot.state === "UNCOVERED" || slot.state === "AT_RISK",
    )
  ) {
    return true;
  }
  return state.milestones.items.some(
    (milestone) =>
      milestone.statusKey === "overdue" || milestone.statusKey === "completed_late",
  );
}

function hasInWindowWork(state: RuntimeLocationAnswersInput): boolean {
  if (state.evidence.dueNow.length > 0) return true;
  if (state.evidence.needsReview.length > 0) return true;
  if (
    applicableSlots(state).some(
      (slot) => slot.state === "NOT_YET_ASSIGNED" || slot.state === "NOT_CONFIRMED",
    )
  ) {
    return true;
  }
  return state.milestones.items.some((milestone) => milestone.statusKey === "due");
}

function happening(state: RuntimeLocationAnswersInput): RuntimeLocationAnswers["happening"] {
  if (state.operation.state === "ACTIVE" && state.operation.current) {
    const label =
      state.operation.current.hierarchyLabel ?? state.operation.current.label;
    return { state: "active", label: `${label} · Active` };
  }
  if (!locationProgramIsAttached(state.program.locationProgram)) {
    return { state: "unprogrammed", label: HAPPENING_UNPROGRAMMED_LABEL };
  }
  return { state: "none", label: HAPPENING_NONE_LABEL };
}

function pace(state: RuntimeLocationAnswersInput): RuntimePace {
  if (hasProblem(state)) return "at_risk";
  if (state.operation.state === "ACTIVE") {
    return hasInWindowWork(state) ? "on_time" : "ready";
  }
  return "idle";
}

function assignedPeople(state: RuntimeLocationAnswersInput): RuntimeResponsiblePerson[] {
  const seen = new Set<string>();
  const people: RuntimeResponsiblePerson[] = [];
  for (const slot of state.coverage.slots) {
    for (const ref of slot.assignmentRefs) {
      if (seen.has(ref.assignmentId)) continue;
      seen.add(ref.assignmentId);
      people.push({
        assignmentId: ref.assignmentId,
        employeeId: ref.employeeId,
        employeeDisplayName: ref.employeeDisplayName,
        slotLabel: slot.roleLabel,
      });
    }
  }
  return people;
}

export function deriveRuntimeLocationAnswers(
  state: RuntimeLocationAnswersInput,
): RuntimeLocationAnswers {
  const current = state.operation.current;
  return {
    happening: happening(state),
    responsible: {
      teams: state.program.locationProgram.teams.map((team) => ({
        id: team.id,
        name: team.name,
      })),
      assigned: assignedPeople(state),
      need: applicableSlots(state).map((slot) => ({
        teamId: teamIdFromRoleKey(slot.roleKey),
        teamName: slot.roleLabel,
        requiredCount: slot.requiredCount,
        filledCount: slot.filledCount,
        state: slot.state,
        cycleStableKey: slot.cycleStableKey,
      })),
    },
    cycle: {
      open: current
        ? {
            cycleStableKey: current.cycleStableKey,
            label: current.hierarchyLabel ?? current.label,
            window: current.window,
          }
        : null,
      upcoming: state.operation.upcoming,
    },
    pace: pace(state),
    evidenceDue: {
      dueNow: state.evidence.dueNow.map((key) => evidenceDueItem(state, key)),
      overdue: state.evidence.overdue.map((key) => evidenceDueItem(state, key)),
      upcoming: state.evidence.upcoming.map((key) => evidenceDueItem(state, key)),
    },
    wrong: [...state.exceptions],
    next: state.next,
  };
}

export function withRuntimeLocationAnswers(
  state: RuntimeLocationAnswersInput,
): RuntimeLocationState {
  return { ...state, answers: deriveRuntimeLocationAnswers(state) };
}
