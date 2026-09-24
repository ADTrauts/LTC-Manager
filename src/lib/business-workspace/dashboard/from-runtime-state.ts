/**
 * RuntimeLocationState[] → DashboardWorkspaceViewModel.
 *
 * Counts, groups, labels, earliest next, intervention rows.
 * Does not query, evaluate coverage, resolve logs/cycles, or call readiness.
 */

import { presentLandingNeighborhood } from "@/lib/locations/landing";
import type { RuntimeException, RuntimeLocationState } from "@/lib/runtime-location-state";
import { neighborhoodExceptionRank } from "@/lib/unit-workspace/neighborhood";
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
  type DashboardWorkspaceViewModel,
} from "./types";

function spaceHref(unitId: string, spaceId: string, section?: "coverage" | "evidence" | "assets" | "milestones"): string {
  const base = `/unit/${unitId}?space=${encodeURIComponent(spaceId)}`;
  return section ? `${base}#${spaceWorkspaceAnchorId(section)}` : base;
}

function interventionHref(exception: RuntimeException, unitId: string, spaceId: string): string {
  if (exception.source === "coverage") return spaceHref(unitId, spaceId, "coverage");
  if (exception.source === "evidence") return exception.href ?? spaceHref(unitId, spaceId, "evidence");
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
  const applicableSlots = evaluated.flatMap((state) =>
    state.coverage.slots.filter((slot) => slot.state !== "NOT_APPLICABLE"),
  );
  const uncoveredSlotCount = applicableSlots.filter((slot) => slot.state === "UNCOVERED").length;
  const atRiskSlotCount = applicableSlots.filter((slot) => slot.state === "AT_RISK").length;

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

  if (applicableSlots.length === 0) {
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
  if (!state.next) return null;
  const unitId = state.identity.location.unitId ?? "";
  const spaceId = state.identity.location.spaceId;
  return {
    label: state.next.label,
    spaceName: state.identity.displayName,
    spaceId,
    unitId,
    timeLabel: formatClock(state.next.at, state.asOf.timezone),
    href: spaceHref(unitId, spaceId),
  };
}

function presentInterventions(states: readonly RuntimeLocationState[]): DashboardInterventionView[] {
  const rows: Array<DashboardInterventionView & { rank: number }> = [];
  for (const state of states) {
    const unitId = state.identity.location.unitId ?? "";
    const spaceId = state.identity.location.spaceId;
    for (const exception of state.exceptions) {
      rows.push({
        id: `${spaceId}:${exception.source}:${exception.state}:${exception.label}`,
        spaceId,
        unitId,
        spaceName: state.identity.displayName,
        label: exception.label,
        source: exception.source,
        state: exception.state,
        href: interventionHref(exception, unitId, spaceId),
        rank: neighborhoodExceptionRank(exception),
      });
    }
  }
  return rows
    .sort((a, b) => a.rank - b.rank || a.spaceName.localeCompare(b.spaceName))
    .slice(0, DASHBOARD_INTERVENTION_LIMIT)
    .map(({ rank: _rank, ...row }) => row);
}

export function presentDashboardWorkspace(
  states: readonly RuntimeLocationState[],
): DashboardWorkspaceViewModel {
  const landing = presentLandingNeighborhood(states);
  const coverage = presentCoverage(states);
  const withNext = states
    .filter((state) => state.next)
    .sort((a, b) => a.next!.at.getTime() - b.next!.at.getTime());
  const upcoming = withNext
    .map((state) => presentNext(state))
    .filter((row): row is DashboardNextView => row != null)
    .slice(0, DASHBOARD_UPCOMING_LIMIT);

  const mixed =
    landing.operationLabel?.includes("active operations") ||
    (landing.operationLabel != null &&
      landing.operationLabel !== DASHBOARD_NO_ACTIVE_OPERATION_LABEL &&
      /\d+ active operations/.test(landing.operationLabel));

  return {
    spaceCount: states.length,
    operatingCount: states.filter((state) => state.operation.state === "ACTIVE").length,
    attentionCount: states.filter((state) => state.exceptions.length > 0).length,
    overdueEvidenceCount: states.reduce((sum, state) => sum + state.evidence.overdue.length, 0),
    dueNowEvidenceCount: states.reduce((sum, state) => sum + state.evidence.dueNow.length, 0),
    correctiveEvidenceCount: states.reduce(
      (sum, state) => sum + state.evidence.correctiveOpen.length + state.evidence.needsReview.length,
      0,
    ),
    assetImpactCount: states.reduce((sum, state) => sum + state.assets.issuesAffectingOperation.length, 0),
    lateMilestoneCount: states.reduce(
      (sum, state) =>
        sum +
        state.exceptions.filter(
          (exception) =>
            exception.source === "milestone" &&
            (exception.state === "overdue" || exception.state === "completed_late"),
        ).length,
      0,
    ),
    configurationCount: states.filter((state) => state.program.operationalType.state === "unassigned").length,
    operation: {
      kind:
        landing.operationLabel === DASHBOARD_NO_ACTIVE_OPERATION_LABEL || !landing.operationLabel
          ? "none"
          : mixed
            ? "mixed"
            : "shared",
      label: mixed
        ? DASHBOARD_MULTIPLE_OPERATIONS_LABEL
        : (landing.operationLabel ?? DASHBOARD_NO_ACTIVE_OPERATION_LABEL),
    },
    coverage,
    next: upcoming[0] ?? null,
    upcoming,
    interventions: presentInterventions(states),
  };
}
