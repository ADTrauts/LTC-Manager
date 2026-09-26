/**
 * Review replay of a past service date from Runtime Location State answers.
 * Planned vs assigned vs actual, evidence, issues. Not a Locations tree reprint.
 */

import type { RuntimeLocationState } from "@/lib/runtime-location-state";

import type { PresentedLocationRow } from "./present-operational-review-day";

function paceLabel(state: RuntimeLocationState): string {
  if (state.answers.happening.state === "unprogrammed") return "Not programmed";
  if (state.answers.pace === "at_risk") return "At risk";
  if (state.answers.pace === "on_time") return "On time";
  if (state.answers.pace === "ready") return "Ready";
  return state.answers.happening.label;
}

function plannedLabel(state: RuntimeLocationState): string | null {
  const need = state.answers.responsible.need[0];
  if (need) {
    const extra = state.answers.responsible.need.length - 1;
    const line = `${need.teamName} · ${need.requiredCount} planned`;
    return extra > 0 ? `${line} · +${extra} more` : line;
  }
  const teams = state.answers.responsible.teams.map((team) => team.name);
  return teams.length > 0 ? teams.join(", ") : null;
}

function assignedLabel(state: RuntimeLocationState): string | null {
  const assigned = state.answers.responsible.assigned;
  if (assigned.length === 0) return null;
  return assigned.length === 1 ? "1 assigned" : `${assigned.length} assigned`;
}

function actualLabel(state: RuntimeLocationState): string | null {
  const need = state.answers.responsible.need[0];
  if (!need) return assignedLabel(state);
  return `${need.filledCount} of ${need.requiredCount}`;
}

function evidenceLabel(state: RuntimeLocationState): string | null {
  const overdue = state.answers.evidenceDue.overdue;
  if (overdue.length === 1) return `${overdue[0]!.label} overdue`;
  if (overdue.length > 1) return `${overdue.length} overdue logs`;
  const dueNow = state.answers.evidenceDue.dueNow;
  if (dueNow.length === 1) return `${dueNow[0]!.label} due`;
  if (dueNow.length > 1) return `${dueNow.length} logs due`;
  return null;
}

function programLabel(state: RuntimeLocationState): string | null {
  const program = state.program.locationProgram;
  const teams = program.teams.map((team) => team.name).join(", ");
  const parts = [program.location.facilityTypeLabel, teams || null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function presentReviewLocationsFromRuntime(
  states: readonly RuntimeLocationState[],
): PresentedLocationRow[] {
  return [...states]
    .sort((a, b) => {
      const paceRank =
        (a.answers.pace === "at_risk" ? 0 : 1) - (b.answers.pace === "at_risk" ? 0 : 1);
      if (paceRank !== 0) return paceRank;
      return a.identity.displayName.localeCompare(b.identity.displayName);
    })
    .map((state) => {
      const wrong = state.answers.wrong;
      const unitId = state.identity.location.unitId;
      return {
        spaceId: state.identity.location.spaceId,
        displayLabel: state.identity.displayName,
        parentUnitId: unitId,
        parentUnitLabel: state.identity.hierarchy.neighborhoodName ?? state.identity.hierarchy.unitName,
        operationalTypeName: programLabel(state),
        currentLocationHref: unitId
          ? `/unit/${unitId}?space=${encodeURIComponent(state.identity.location.spaceId)}`
          : null,
        exceptionCount: wrong.length,
        exceptionSummary:
          wrong.length === 0
            ? "No exceptions"
            : `${wrong.length} exception${wrong.length === 1 ? "" : "s"}`,
        availabilityNotes: [],
        paceLabel: paceLabel(state),
        happeningLabel: state.answers.happening.label,
        plannedLabel: plannedLabel(state),
        assignedLabel: assignedLabel(state),
        actualLabel: actualLabel(state),
        evidenceLabel: evidenceLabel(state),
      };
    });
}

export function overlayReviewLocationsFromRuntime(
  locations: readonly PresentedLocationRow[],
  states: readonly RuntimeLocationState[],
): PresentedLocationRow[] {
  const replay = new Map(
    presentReviewLocationsFromRuntime(states).map((row) => [row.spaceId, row] as const),
  );
  return locations.map((location) => replay.get(location.spaceId) ?? location);
}
