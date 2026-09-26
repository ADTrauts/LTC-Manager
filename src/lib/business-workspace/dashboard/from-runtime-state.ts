/**
 * Runtime Location State answers → Dashboard aggregation.
 *
 * Overall state + where to look. Not 17 stacked cards. Not Site Pulse.
 * Does not query, evaluate coverage, or call readiness.
 */

import type { RuntimeException, RuntimeLocationState } from "@/lib/runtime-location-state";
import { formatClock, spaceWorkspaceAnchorId } from "@/lib/unit-workspace/space";

import {
  DASHBOARD_COVERAGE_UNAVAILABLE_LABEL,
  DASHBOARD_INTERVENTION_LIMIT,
  DASHBOARD_MULTIPLE_OPERATIONS_LABEL,
  DASHBOARD_NO_ACTIVE_OPERATION_LABEL,
  DASHBOARD_UPCOMING_LIMIT,
  type DashboardCoverageView,
  type DashboardInterventionView,
  type DashboardNextView,
  type DashboardPaceCounts,
  type DashboardWorkspaceViewModel,
} from "./types";

function spaceHref(
  unitId: string,
  spaceId: string,
  section?: "coverage" | "evidence" | "assets" | "milestones",
): string {
  const base = `/unit/${unitId}?space=${encodeURIComponent(spaceId)}`;
  return section ? `${base}#${spaceWorkspaceAnchorId(section)}` : base;
}

function lookAtHref(exception: RuntimeException | undefined, unitId: string, spaceId: string): string {
  if (!exception) return spaceHref(unitId, spaceId);
  if (exception.source === "coverage") return spaceHref(unitId, spaceId, "coverage");
  if (exception.source === "evidence" || exception.source === "corrective_action") {
    return exception.href ?? spaceHref(unitId, spaceId, "evidence");
  }
  if (exception.source === "asset_issue") return exception.href ?? spaceHref(unitId, spaceId, "assets");
  if (exception.source === "milestone") return spaceHref(unitId, spaceId, "milestones");
  return exception.href ?? spaceHref(unitId, spaceId);
}

function presentCoverage(states: readonly RuntimeLocationState[]): DashboardCoverageView {
  if (states.length === 0) {
    return {
      availability: "none",
      unavailable: false,
      summary: "No operational spaces in scope.",
      evaluatedCount: 0,
      uncoveredSlotCount: 0,
      atRiskSlotCount: 0,
      disabledCount: 0,
    };
  }

  const disabled = states.filter((state) => state.coverage.availability === "feature_disabled");
  const evaluated = states.filter((state) => state.coverage.availability === "evaluated");
  const need = evaluated.flatMap((state) =>
    state.answers.responsible.need.filter((row) => row.state !== "NOT_APPLICABLE"),
  );
  const uncoveredSlotCount = need.filter((row) => row.state === "UNCOVERED").length;
  const atRiskSlotCount = need.filter((row) => row.state === "AT_RISK").length;

  if (disabled.length === states.length) {
    return {
      availability: "feature_disabled",
      unavailable: true,
      summary: DASHBOARD_COVERAGE_UNAVAILABLE_LABEL,
      evaluatedCount: 0,
      uncoveredSlotCount: 0,
      atRiskSlotCount: 0,
      disabledCount: disabled.length,
    };
  }

  if (disabled.length > 0 && evaluated.length > 0) {
    return {
      availability: "mixed",
      unavailable: false,
      summary: `${evaluated.length} ${evaluated.length === 1 ? "location" : "locations"} evaluated · ${disabled.length} coverage unavailable`,
      evaluatedCount: evaluated.length,
      uncoveredSlotCount,
      atRiskSlotCount,
      disabledCount: disabled.length,
    };
  }

  if (need.length === 0) {
    return {
      availability: "none",
      unavailable: false,
      summary: "No coverage responsibilities evaluated.",
      evaluatedCount: evaluated.length,
      uncoveredSlotCount: 0,
      atRiskSlotCount: 0,
      disabledCount: 0,
    };
  }

  const parts = [`${evaluated.length} ${evaluated.length === 1 ? "location" : "locations"} evaluated`];
  if (uncoveredSlotCount > 0) {
    parts.push(
      `${uncoveredSlotCount} uncovered ${uncoveredSlotCount === 1 ? "responsibility" : "responsibilities"}`,
    );
  }
  if (atRiskSlotCount > 0) {
    parts.push(`${atRiskSlotCount} at-risk ${atRiskSlotCount === 1 ? "responsibility" : "responsibilities"}`);
  }
  if (uncoveredSlotCount === 0 && atRiskSlotCount === 0) {
    parts.push("no coverage gaps");
  }

  return {
    availability: "evaluated",
    unavailable: false,
    summary: parts.join(" · "),
    evaluatedCount: evaluated.length,
    uncoveredSlotCount,
    atRiskSlotCount,
    disabledCount: 0,
  };
}

function presentNext(state: RuntimeLocationState): DashboardNextView | null {
  const next = state.answers.next;
  if (!next) return null;
  const unitId = state.identity.location.unitId ?? "";
  const spaceId = state.identity.location.spaceId;
  return {
    label: next.label,
    spaceName: state.identity.displayName,
    spaceId,
    unitId,
    timeLabel: formatClock(next.at, state.asOf.timezone),
    href: spaceHref(unitId, spaceId),
  };
}

function presentLookAts(states: readonly RuntimeLocationState[]): DashboardInterventionView[] {
  return states
    .filter((state) => state.answers.pace === "at_risk")
    .map((state) => {
      const first = state.answers.wrong[0];
      const unitId = state.identity.location.unitId ?? "";
      const spaceId = state.identity.location.spaceId;
      return {
        id: spaceId,
        spaceId,
        unitId,
        spaceName: state.identity.displayName,
        label: first?.label ?? state.answers.happening.label,
        source: first?.source ?? "runtime_delay",
        state: first?.state ?? state.answers.pace,
        href: lookAtHref(first, unitId, spaceId),
      };
    })
    .sort((a, b) => a.spaceName.localeCompare(b.spaceName))
    .slice(0, DASHBOARD_INTERVENTION_LIMIT);
}

function presentOperation(states: readonly RuntimeLocationState[]): DashboardWorkspaceViewModel["operation"] {
  const active = states.filter((state) => state.answers.happening.state === "active");
  if (active.length === 0) {
    return { kind: "none", label: DASHBOARD_NO_ACTIVE_OPERATION_LABEL };
  }
  const labels = new Set(
    active.map((state) => state.answers.cycle.open?.label ?? state.answers.happening.label),
  );
  if (labels.size > 1) {
    return { kind: "mixed", label: DASHBOARD_MULTIPLE_OPERATIONS_LABEL };
  }
  return {
    kind: "shared",
    label: active[0]!.answers.happening.label,
  };
}

function presentPace(states: readonly RuntimeLocationState[]): DashboardPaceCounts {
  const pace: DashboardPaceCounts = {
    at_risk: 0,
    on_time: 0,
    ready: 0,
    idle: 0,
    unprogrammed: 0,
  };
  for (const state of states) {
    if (state.answers.happening.state === "unprogrammed") {
      pace.unprogrammed += 1;
      continue;
    }
    pace[state.answers.pace] += 1;
  }
  return pace;
}

export function presentDashboardWorkspace(
  states: readonly RuntimeLocationState[],
): DashboardWorkspaceViewModel {
  const coverage = presentCoverage(states);
  const withNext = states
    .filter((state) => state.answers.next)
    .sort((a, b) => a.answers.next!.at.getTime() - b.answers.next!.at.getTime());
  const upcoming = withNext
    .map((state) => presentNext(state))
    .filter((row): row is DashboardNextView => row != null)
    .slice(0, DASHBOARD_UPCOMING_LIMIT);
  const pace = presentPace(states);

  return {
    spaceCount: states.length,
    operatingCount: states.filter((state) => state.answers.happening.state === "active").length,
    attentionCount: pace.at_risk,
    overdueEvidenceCount: states.reduce(
      (sum, state) => sum + state.answers.evidenceDue.overdue.length,
      0,
    ),
    dueNowEvidenceCount: states.reduce(
      (sum, state) => sum + state.answers.evidenceDue.dueNow.length,
      0,
    ),
    correctiveEvidenceCount: states.reduce(
      (sum, state) => sum + state.evidence.correctiveOpen.length + state.evidence.needsReview.length,
      0,
    ),
    assetImpactCount: states.reduce(
      (sum, state) => sum + state.assets.issuesAffectingOperation.length,
      0,
    ),
    lateMilestoneCount: states.reduce(
      (sum, state) =>
        sum +
        state.answers.wrong.filter(
          (exception) =>
            exception.source === "milestone" &&
            (exception.state === "overdue" || exception.state === "completed_late"),
        ).length,
      0,
    ),
    configurationCount: pace.unprogrammed,
    pace,
    operation: presentOperation(states),
    coverage,
    next: upcoming[0] ?? null,
    upcoming,
    interventions: presentLookAts(states),
  };
}
