/**
 * RuntimeLocationState[] → NeighborhoodWorkspaceViewModel.
 *
 * Counts, groups, labels, earliest next. Does not query, resolve cycles,
 * evaluate coverage, or infer asset/staffing truth.
 */

import { presentLandingNeighborhood, presentLandingSpace } from "@/lib/locations/landing";
import type { RuntimeException, RuntimeLocationState } from "@/lib/runtime-location-state";
import { formatClock, formatLocalHhMm } from "@/lib/unit-workspace/space";
import type { SpaceWorkspaceViewer } from "@/lib/unit-workspace/space";

import {
  NEIGHBORHOOD_COVERAGE_UNAVAILABLE_LABEL,
  NEIGHBORHOOD_NO_ACTIVE_OPERATION_LABEL,
  NEIGHBORHOOD_NO_OPERATIONAL_SPACES_COPY,
  type NeighborhoodAssetView,
  type NeighborhoodChangeView,
  type NeighborhoodCoverageView,
  type NeighborhoodEvidenceGroupView,
  type NeighborhoodEvidenceItemView,
  type NeighborhoodExceptionView,
  type NeighborhoodMilestoneView,
  type NeighborhoodSpaceRowView,
  type NeighborhoodWorkspaceSectionId,
  type NeighborhoodWorkspaceViewModel,
} from "./types";

const IMPACT_LABEL = {
  NO_IMMEDIATE_IMPACT: "No immediate impact",
  WORKAROUND_AVAILABLE: "Workaround available",
  SERVICE_AT_RISK: "Service at risk",
  EQUIPMENT_UNAVAILABLE: "Equipment unavailable",
} as const;

const STATUS_LABEL = {
  OPERATIONAL: "Operational",
  DEGRADED: "Degraded",
  OUT_OF_SERVICE: "Out of service",
  RETIRED: "Retired",
} as const;

export function neighborhoodExceptionRank(exception: RuntimeException): number {
  if (exception.source === "coverage" && exception.state === "UNCOVERED") return 0;
  if (exception.source === "coverage" && exception.state === "AT_RISK") return 1;
  if (
    exception.source === "asset_issue" &&
    (exception.state === "SERVICE_AT_RISK" || exception.state === "EQUIPMENT_UNAVAILABLE")
  ) {
    return 2;
  }
  if (exception.source === "evidence" && exception.state === "OVERDUE") return 3;
  if (
    exception.source === "milestone" &&
    (exception.state === "overdue" || exception.state === "completed_late")
  ) {
    return 4;
  }
  return 5;
}

function spaceHref(unitId: string, spaceId: string): string {
  return `/unit/${unitId}?space=${encodeURIComponent(spaceId)}`;
}

function evidenceAction(item: RuntimeLocationState["evidence"]["items"][number]): {
  href: string | null;
  label: string | null;
} {
  const completed =
    item.productState === "COMPLETED" || item.productState === "COMPLETED_WITH_EXCEPTION";
  if (completed && item.href) return { href: item.href, label: "View record" };
  if (item.productState === "DUE" || item.productState === "OVERDUE") {
    const params = new URLSearchParams({
      attachmentId: item.attachmentId,
      requirementKey: item.requirementKey,
    });
    return {
      href: `/staffing/logs/open?${params.toString()}`,
      label: item.recordId ? "Continue log" : "Start log",
    };
  }
  if (item.productState === "UPCOMING") {
    const params = new URLSearchParams({
      attachmentId: item.attachmentId,
      requirementKey: item.requirementKey,
    });
    return { href: `/staffing/logs/open?${params.toString()}`, label: "Open log" };
  }
  return { href: item.href, label: null };
}

function presentCoverage(states: readonly RuntimeLocationState[]): NeighborhoodCoverageView {
  if (states.length === 0) {
    return {
      availability: "none",
      unavailable: false,
      summary: null,
      evaluatedCount: 0,
      coveredCount: 0,
      uncoveredCount: 0,
      disabledCount: 0,
    };
  }

  const disabled = states.filter((state) => state.coverage.availability === "feature_disabled");
  const evaluated = states.filter((state) => state.coverage.availability === "evaluated");
  const required = evaluated.filter((state) =>
    state.coverage.slots.some((slot) => slot.state !== "NOT_APPLICABLE"),
  );
  const covered = required.filter((state) => {
    const slots = state.coverage.slots.filter((slot) => slot.state !== "NOT_APPLICABLE");
    return slots.length > 0 && slots.every((slot) => slot.state === "COVERED");
  });
  const uncovered = required.filter((state) =>
    state.coverage.slots.some((slot) => slot.state === "UNCOVERED" || slot.state === "AT_RISK"),
  );

  if (disabled.length === states.length) {
    return {
      availability: "feature_disabled",
      unavailable: true,
      summary: NEIGHBORHOOD_COVERAGE_UNAVAILABLE_LABEL,
      evaluatedCount: 0,
      coveredCount: 0,
      uncoveredCount: 0,
      disabledCount: disabled.length,
    };
  }

  if (disabled.length > 0 && evaluated.length > 0) {
    return {
      availability: "mixed",
      unavailable: false,
      summary: `${evaluated.length} ${evaluated.length === 1 ? "space has" : "spaces have"} evaluated coverage · ${disabled.length} coverage unavailable`,
      evaluatedCount: required.length,
      coveredCount: covered.length,
      uncoveredCount: uncovered.length,
      disabledCount: disabled.length,
    };
  }

  if (required.length === 0) {
    return {
      availability: "none",
      unavailable: false,
      summary: null,
      evaluatedCount: 0,
      coveredCount: 0,
      uncoveredCount: 0,
      disabledCount: disabled.length,
    };
  }

  return {
    availability: "evaluated",
    unavailable: false,
    summary: `${required.length} ${required.length === 1 ? "space" : "spaces"} with evaluated coverage · ${covered.length} fully covered · ${uncovered.length} uncovered`,
    evaluatedCount: required.length,
    coveredCount: covered.length,
    uncoveredCount: uncovered.length,
    disabledCount: 0,
  };
}

function presentEvidence(
  states: readonly RuntimeLocationState[],
  unitId: string,
  employee: boolean,
): NeighborhoodEvidenceGroupView[] {
  const take = (
    id: NeighborhoodEvidenceGroupView["id"],
    title: string,
    pick: (state: RuntimeLocationState) => readonly string[],
  ): NeighborhoodEvidenceGroupView => {
    const items: NeighborhoodEvidenceItemView[] = [];
    for (const state of states) {
      const keys = new Set(pick(state));
      for (const item of state.evidence.items) {
        if (!keys.has(item.requirementKey)) continue;
        if (
          employee &&
          id !== "needs_attention" &&
          id !== "due_now" &&
          item.productState !== "DUE" &&
          item.productState !== "OVERDUE"
        ) {
          continue;
        }
        const action = evidenceAction(item);
        items.push({
          spaceId: state.identity.location.spaceId,
          spaceName: state.identity.displayName,
          requirementKey: item.requirementKey,
          displayName: item.displayName,
          productState: item.productState,
          href: `${spaceHref(unitId, state.identity.location.spaceId)}&evidence=${encodeURIComponent(item.requirementKey)}#evidence`,
          actionHref: action.href,
          actionLabel: action.label,
        });
      }
    }
    return { id, title, items };
  };

  const attention = take("needs_attention", "Needs Attention", (state) => [
    ...new Set([...state.evidence.overdue, ...state.evidence.correctiveOpen, ...state.evidence.needsReview]),
  ]);
  const attentionKeys = new Set(
    attention.items.map((item) => `${item.spaceId}:${item.requirementKey}`),
  );
  const due = take("due_now", "Due Now", (state) => state.evidence.dueNow);
  due.items = due.items.filter((item) => !attentionKeys.has(`${item.spaceId}:${item.requirementKey}`));
  const upcoming = take("upcoming", "Upcoming", (state) => state.evidence.upcoming);
  upcoming.items = upcoming.items.filter(
    (item) => !attentionKeys.has(`${item.spaceId}:${item.requirementKey}`),
  );
  const completed = take("completed_today", "Completed Today", (state) => state.evidence.completed);
  completed.items = completed.items.filter(
    (item) => !attentionKeys.has(`${item.spaceId}:${item.requirementKey}`),
  );

  return [attention, due, upcoming, completed].filter((group) => group.items.length > 0);
}

function presentAssets(states: readonly RuntimeLocationState[]): NeighborhoodAssetView[] {
  const rows: NeighborhoodAssetView[] = [];
  for (const state of states) {
    const issuesByAsset = new Map<string, NeighborhoodAssetView["issues"]>();
    for (const issue of state.assets.openIssues) {
      const list = issuesByAsset.get(issue.assetId) ?? [];
      list.push({
        issueId: issue.issueId,
        summary: issue.summary,
        impact: issue.impact,
        impactLabel: IMPACT_LABEL[issue.impact],
        operationalException:
          issue.impact === "SERVICE_AT_RISK" || issue.impact === "EQUIPMENT_UNAVAILABLE",
        href: issue.href,
      });
      issuesByAsset.set(issue.assetId, list);
    }
    for (const asset of state.assets.assets) {
      rows.push({
        spaceId: state.identity.location.spaceId,
        spaceName: state.identity.displayName,
        assetId: asset.assetId,
        name: asset.name,
        status: asset.status,
        statusLabel: STATUS_LABEL[asset.status] ?? asset.status,
        openIssueCount: asset.openIssueCount,
        openWorkOrderCount: asset.openWorkOrderCount,
        href: `/assets/${asset.assetId}`,
        issues: issuesByAsset.get(asset.assetId) ?? [],
      });
    }
  }
  return rows;
}

function presentMilestones(states: readonly RuntimeLocationState[]): NeighborhoodMilestoneView[] {
  const rows: NeighborhoodMilestoneView[] = [];
  for (const state of states) {
    for (const item of state.milestones.items) {
      rows.push({
        spaceId: state.identity.location.spaceId,
        spaceName: state.identity.displayName,
        kind: item.kind,
        label: item.label,
        configured: formatLocalHhMm(item.timing.configured),
        adjusted: formatLocalHhMm(item.timing.adjusted),
        actual: formatLocalHhMm(item.timing.actual),
      });
    }
  }
  return rows;
}

function presentChanges(
  states: readonly RuntimeLocationState[],
  timezone: string,
): NeighborhoodChangeView[] {
  return states
    .flatMap((state) =>
      state.changes.map((change) => ({
        spaceId: state.identity.location.spaceId,
        spaceName: state.identity.displayName,
        atLabel: change.at.getTime() === 0 ? "" : formatClock(change.at, timezone),
        detail: change.detail,
        at: change.at.getTime(),
      })),
    )
    .sort((a, b) => a.at - b.at)
    .map(({ spaceId, spaceName, atLabel, detail }) => ({ spaceId, spaceName, atLabel, detail }));
}

function earliestNext(
  states: readonly RuntimeLocationState[],
): NeighborhoodWorkspaceViewModel["next"] {
  const withNext = states
    .filter((state) => state.next)
    .sort((a, b) => a.next!.at.getTime() - b.next!.at.getTime());
  const first = withNext[0];
  if (!first?.next) return null;
  return {
    label: first.next.label,
    spaceName: first.identity.displayName,
    timeLabel: formatClock(first.next.at, first.asOf.timezone),
  };
}

function presentExceptions(states: readonly RuntimeLocationState[]): NeighborhoodExceptionView[] {
  const rows: NeighborhoodExceptionView[] = [];
  for (const state of states) {
    for (const exception of [...state.exceptions].sort(
      (a, b) => neighborhoodExceptionRank(a) - neighborhoodExceptionRank(b),
    )) {
      rows.push({
        spaceId: exception.location.spaceId,
        spaceName: state.identity.displayName,
        label: exception.label,
        source: exception.source,
        state: exception.state,
        href: exception.href ?? spaceHref(state.identity.location.unitId ?? "", state.identity.location.spaceId),
      });
    }
  }
  return rows.sort((a, b) => {
    const rankA = neighborhoodExceptionRank({
      source: a.source as RuntimeException["source"],
      state: a.state,
    } as RuntimeException);
    const rankB = neighborhoodExceptionRank({
      source: b.source as RuntimeException["source"],
      state: b.state,
    } as RuntimeException);
    return rankA - rankB;
  });
}

function sectionOrder(employee: boolean): NeighborhoodWorkspaceSectionId[] {
  if (employee) {
    return ["overview", "spaces", "evidence", "coverage", "assets", "milestones", "today"];
  }
  return ["overview", "spaces", "coverage", "evidence", "assets", "milestones", "today"];
}

export function presentNeighborhoodWorkspace(
  states: readonly RuntimeLocationState[],
  options: {
    unitId: string;
    unitName: string;
    viewer: SpaceWorkspaceViewer;
    unitTab?: string | null;
    emptySpaceActions?: {
      facilityBuilderHref: string | null;
      departmentLocationsHref: string | null;
    };
  },
): NeighborhoodWorkspaceViewModel {
  const employee = options.viewer.kind === "employee";
  const landing = presentLandingNeighborhood(states);
  const timezone = states[0]?.asOf.timezone ?? "UTC";
  const first = states[0];
  const breadcrumbs: NeighborhoodWorkspaceViewModel["identity"]["breadcrumbs"] = [];
  if (first?.identity.hierarchy.floorName) {
    breadcrumbs.push({ label: first.identity.hierarchy.floorName, grain: "floor" });
  }
  breadcrumbs.push({ label: options.unitName, grain: "neighborhood" });

  const spaces: NeighborhoodSpaceRowView[] = states.map((state) => ({
    spaceId: state.identity.location.spaceId,
    unitId: state.identity.location.unitId ?? options.unitId,
    name: state.identity.displayName,
    href: spaceHref(state.identity.location.unitId ?? options.unitId, state.identity.location.spaceId),
    landing: presentLandingSpace(state),
  }));

  const coverage = presentCoverage(states);
  const evidenceGroups = presentEvidence(states, options.unitId, employee);
  const assets = presentAssets(states);
  const milestones = presentMilestones(states);
  const today = presentChanges(states, timezone);
  const order = sectionOrder(employee);
  const overdueEvidenceCount = states.reduce((sum, state) => sum + state.evidence.overdue.length, 0);
  const attentionCount = states.filter((state) => state.exceptions.length > 0).length;
  const retiredLogsTab = options.unitTab?.trim().toLowerCase() === "logs";
  const presentById: Record<NeighborhoodWorkspaceSectionId, boolean> = {
    overview: true,
    spaces: true,
    coverage: employee
      ? coverage.unavailable
      : coverage.unavailable || coverage.summary != null,
    evidence: true,
    assets: assets.length > 0,
    milestones: milestones.length > 0,
    today: today.length > 0,
  };

  return {
    identity: {
      unitId: options.unitId,
      displayName: options.unitName,
      breadcrumbs,
    },
    spaceCount: states.length,
    attentionCount,
    overdueEvidenceCount,
    operation: {
      kind:
        landing.operationLabel === NEIGHBORHOOD_NO_ACTIVE_OPERATION_LABEL
          ? "none"
          : landing.operationLabel?.includes("active operations")
            ? "mixed"
            : landing.operationLabel
              ? "shared"
              : "none",
      label: landing.operationLabel ?? NEIGHBORHOOD_NO_ACTIVE_OPERATION_LABEL,
    },
    next: earliestNext(states),
    exceptions: presentExceptions(states),
    spaces,
    coverage,
    evidence: {
      groups: evidenceGroups,
      overdueCount: overdueEvidenceCount,
    },
    assets,
    milestones,
    today,
    sections: order.map((id) => ({
      id,
      title:
        id === "overview"
          ? "Overview"
          : id === "spaces"
            ? "Spaces"
            : id === "coverage"
              ? "Staffing & Coverage"
              : id === "evidence"
                ? "Work & Evidence"
                : id === "assets"
                  ? "Assets & Issues"
                  : id === "milestones"
                    ? "Operations & Milestones"
                    : "Today",
      present: presentById[id],
    })),
    sectionOrder: order,
    retiredLogsTab,
    focusSectionId: retiredLogsTab ? "evidence" : null,
    showDetailedCoverage: !employee,
    managerLinks: {
      maintenanceHref: options.viewer.kind === "manager" ? "/assets" : null,
      logBookHref: employee ? null : "/staffing/log-book",
    },
    emptySpaces:
      states.length === 0
        ? {
            copy: NEIGHBORHOOD_NO_OPERATIONAL_SPACES_COPY,
            facilityBuilderHref: options.emptySpaceActions?.facilityBuilderHref ?? null,
            departmentLocationsHref: options.emptySpaceActions?.departmentLocationsHref ?? null,
          }
        : null,
  };
}

export function neighborhoodWorkspaceAnchorId(section: NeighborhoodWorkspaceSectionId): string {
  return section;
}
