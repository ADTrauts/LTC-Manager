/**
 * Runtime Location State answers → exception-first Location cards.
 *
 * Sort and labels only. Does not query, evaluate coverage, or walk the
 * Projection tree. Click-through is the existing location workspace.
 */

import type { RuntimeLocationState } from "@/lib/runtime-location-state";

import {
  EXCEPTION_FIRST_WRONG_LIMIT,
  type ExceptionFirstLocationBoardView,
  type ExceptionFirstLocationCardView,
  type ExceptionFirstPaceBadge,
} from "./types";

const PACE_RANK: Record<ExceptionFirstLocationCardView["pace"], number> = {
  at_risk: 0,
  on_time: 1,
  ready: 2,
  idle: 3,
};

function placeLine(state: RuntimeLocationState): string | null {
  const facilityType =
    state.program.locationProgram.location.facilityTypeLabel ??
    state.identity.physical.roomTypeLabel;
  const parts = [
    state.identity.hierarchy.neighborhoodName,
    state.identity.hierarchy.floorName,
    facilityType,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatNext(state: RuntimeLocationState): string | null {
  if (!state.next) return null;
  const time = state.next.at.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: state.asOf.timezone,
  });
  return `Next: ${state.next.label} · ${time}`;
}

function formatCycle(state: RuntimeLocationState): string | null {
  const open = state.answers.cycle.open;
  if (!open) return null;
  if (open.window.start && open.window.end) {
    return `${open.label} · ${open.window.start}–${open.window.end}`;
  }
  return open.label;
}

function formatResponsible(state: RuntimeLocationState): string | null {
  const need = state.answers.responsible.need[0];
  if (need) {
    const line = `${need.teamName} · ${need.filledCount} of ${need.requiredCount}`;
    const extra = state.answers.responsible.need.length - 1;
    return extra > 0 ? `${line} · +${extra} more` : line;
  }
  const teams = state.answers.responsible.teams.map((team) => team.name);
  return teams.length > 0 ? teams.join(", ") : null;
}

function formatEvidence(state: RuntimeLocationState): string | null {
  const overdue = state.answers.evidenceDue.overdue;
  if (overdue.length === 1) return `${overdue[0]!.label} overdue`;
  if (overdue.length > 1) return `${overdue.length} overdue logs`;
  const dueNow = state.answers.evidenceDue.dueNow;
  if (dueNow.length === 1) return `${dueNow[0]!.label} due now`;
  if (dueNow.length > 1) return `${dueNow.length} logs due now`;
  return null;
}

function paceBadge(state: RuntimeLocationState): ExceptionFirstPaceBadge {
  if (state.answers.happening.state === "unprogrammed") {
    return { variant: "neutral", label: "Not programmed", prominence: "default" };
  }
  if (state.answers.pace === "at_risk") {
    return { variant: "warning", label: "At risk", prominence: "default" };
  }
  if (state.answers.pace === "on_time") {
    return { variant: "in_progress", label: "On time", prominence: "default" };
  }
  if (state.answers.pace === "ready") {
    return { variant: "ready", label: "Ready", prominence: "quiet" };
  }
  return { variant: "neutral", label: state.answers.happening.label, prominence: "default" };
}

function workspaceHref(state: RuntimeLocationState): string | null {
  const unitId = state.identity.location.unitId;
  if (!unitId) return null;
  const base = `/unit/${unitId}?space=${encodeURIComponent(state.identity.location.spaceId)}`;
  const first = state.answers.wrong[0];
  if (!first) return base;
  if (first.source === "coverage") return `${base}#coverage`;
  if (first.source === "evidence" || first.source === "corrective_action") {
    return `${base}#evidence`;
  }
  if (first.source === "asset_issue") return `${base}#assets`;
  if (first.source === "milestone") return `${base}#milestones`;
  return base;
}

export function presentExceptionFirstLocationCard(
  state: RuntimeLocationState,
): ExceptionFirstLocationCardView {
  const answers = state.answers;
  const wrongLabels = answers.wrong.map((row) => row.label);
  return {
    spaceId: state.identity.location.spaceId,
    href: workspaceHref(state),
    name: state.identity.displayName,
    place: placeLine(state),
    emphasized: answers.pace === "at_risk",
    pace: answers.pace,
    happeningState: answers.happening.state,
    badge: paceBadge(state),
    happeningLabel: answers.happening.label,
    cycleLabel: formatCycle(state),
    responsibleLabel: formatResponsible(state),
    wrongLabels: wrongLabels.slice(0, EXCEPTION_FIRST_WRONG_LIMIT),
    moreWrongCount: Math.max(0, wrongLabels.length - EXCEPTION_FIRST_WRONG_LIMIT),
    evidenceLabel: formatEvidence(state),
    nextLabel: formatNext(state),
  };
}

export function presentExceptionFirstLocationBoard(input: {
  states: readonly RuntimeLocationState[];
}): ExceptionFirstLocationBoardView {
  const cards = input.states
    .map((state) => presentExceptionFirstLocationCard(state))
    .sort((a, b) => {
      const happeningRank =
        (a.happeningState === "unprogrammed" ? 1 : 0) -
        (b.happeningState === "unprogrammed" ? 1 : 0);
      if (a.pace !== b.pace) return PACE_RANK[a.pace] - PACE_RANK[b.pace];
      if (happeningRank !== 0) return happeningRank;
      return a.name.localeCompare(b.name);
    });

  return {
    cards,
    spaceCount: cards.length,
    attentionCount: cards.filter((card) => card.pace === "at_risk").length,
  };
}
