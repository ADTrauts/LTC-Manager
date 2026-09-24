/**
 * RuntimeLocationState → SpaceWorkspaceViewModel.
 *
 * Role density, labels, grouping, anchors. Does not query coverage, logs,
 * cycles, or assets. Does not recalculate domain truth.
 */

import type { AppJwtPayload } from "@/lib/auth";
import { hasAtLeastRole } from "@/lib/access";
import type { CanonicalCoverageState } from "@/lib/scheduling/coverage-expectations";
import type {
  RuntimeAdjustment,
  RuntimeAssetFact,
  RuntimeAssetIssueFact,
  RuntimeCoverageSlot,
  RuntimeCoverageState,
  RuntimeCurrentOperation,
  RuntimeEvidenceItem,
  RuntimeEvidenceState,
  RuntimeLocationIdentity,
  RuntimeLocationState,
  RuntimeMilestoneItem,
  RuntimeNextEvent,
} from "@/lib/runtime-location-state";
import type { AssetOperationalImpact } from "@prisma/client";
import type { AssetOperationalStatus } from "@/lib/asset-operations/types";

import {
  SPACE_NO_ACTIVE_OPERATION_LABEL,
  SPACE_UNTYPED_LABEL,
  type SpaceWorkspaceAssetIssueView,
  type SpaceWorkspaceAssetView,
  type SpaceWorkspaceBreadcrumb,
  type SpaceWorkspaceChangeView,
  type SpaceWorkspaceCoverageSlotView,
  type SpaceWorkspaceEvidenceGroupView,
  type SpaceWorkspaceEvidenceItemView,
  type SpaceWorkspaceMilestoneView,
  type SpaceWorkspaceSectionId,
  type SpaceWorkspaceViewer,
  type SpaceWorkspaceViewModel,
} from "./types";

const OVERVIEW_CHANGE_LIMIT = 3;

const COVERAGE_LABEL: Record<CanonicalCoverageState, string> = {
  COVERED: "Covered",
  AT_RISK: "At risk",
  UNCOVERED: "Uncovered",
  NOT_YET_ASSIGNED: "Not yet assigned",
  NOT_CONFIRMED: "Not confirmed",
  NOT_APPLICABLE: "Not applicable",
};

const ASSET_STATUS_LABEL: Record<AssetOperationalStatus, string> = {
  OPERATIONAL: "Operational",
  DEGRADED: "Degraded",
  OUT_OF_SERVICE: "Out of service",
  RETIRED: "Retired",
};

const IMPACT_LABEL: Record<AssetOperationalImpact, string> = {
  NO_IMMEDIATE_IMPACT: "No immediate impact",
  WORKAROUND_AVAILABLE: "Workaround available",
  SERVICE_AT_RISK: "Service at risk",
  EQUIPMENT_UNAVAILABLE: "Equipment unavailable",
};

export function departmentLocationsConfigureHref(departmentId: string): string {
  return `/admin/departments/${departmentId}?tab=locations`;
}

export function resolveSpaceWorkspaceViewer(
  session: Pick<AppJwtPayload, "role" | "authMethod" | "authKind" | "uid">,
): SpaceWorkspaceViewer {
  const pin = session.authMethod === "QUICK_PIN" || session.authKind === "employee";
  if (pin || !hasAtLeastRole(session.role, "SUPERVISOR")) {
    return {
      kind: "employee",
      authMethod: session.authMethod,
      employeeId: session.authKind === "employee" ? session.uid : null,
    };
  }
  return {
    kind: hasAtLeastRole(session.role, "MANAGER") ? "manager" : "supervisor",
    authMethod: session.authMethod,
    employeeId: null,
  };
}

export function formatLocalHhMm(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minute} ${suffix}`;
}

export function formatClock(at: Date, timezone: string): string {
  return at.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
}

function breadcrumbs(identity: RuntimeLocationIdentity): SpaceWorkspaceBreadcrumb[] {
  const rows: SpaceWorkspaceBreadcrumb[] = [];
  if (identity.hierarchy.floorName) {
    rows.push({ label: identity.hierarchy.floorName, grain: "floor" });
  }
  const neighborhood = identity.hierarchy.neighborhoodName ?? identity.hierarchy.unitName;
  if (neighborhood) {
    rows.push({
      label: neighborhood,
      grain: identity.hierarchy.neighborhoodName ? "neighborhood" : "unit",
    });
  }
  rows.push({ label: identity.hierarchy.spaceName, grain: "space" });
  return rows;
}

function formatUpcomingStart(startsAt: string | null, timezone: string): string | null {
  if (!startsAt) return null;
  const asClock = formatLocalHhMm(startsAt);
  if (asClock && asClock !== startsAt) return asClock;
  const instant = new Date(startsAt);
  if (Number.isNaN(instant.getTime())) return startsAt;
  return formatClock(instant, timezone);
}

function operationView(
  operation: RuntimeCurrentOperation,
  timezone: string,
): SpaceWorkspaceViewModel["operation"] {
  if (operation.state === "ACTIVE" && operation.current) {
    const start = formatLocalHhMm(operation.current.window.start);
    const end = formatLocalHhMm(operation.current.window.end);
    return {
      state: "ACTIVE",
      label: operation.current.hierarchyLabel ?? operation.current.label,
      windowLabel: start && end ? `${start} – ${end}` : start ?? end,
      upcomingLabel: null,
    };
  }
  const upcoming = operation.upcoming;
  const upcomingStart = formatUpcomingStart(upcoming?.startsAt ?? null, timezone);
  return {
    state: "NONE",
    label: SPACE_NO_ACTIVE_OPERATION_LABEL,
    windowLabel: null,
    upcomingLabel: upcoming
      ? upcomingStart
        ? `${upcoming.label} · ${upcomingStart}`
        : upcoming.label
      : null,
  };
}

function coverageLabelForSlot(state: CanonicalCoverageState): string {
  return COVERAGE_LABEL[state];
}

function assignedSummary(slot: RuntimeCoverageSlot): { names: string[]; summary: string } {
  const names = slot.assignmentRefs
    .map((row) => row.employeeDisplayName?.trim())
    .filter((value): value is string => Boolean(value));
  if (names.length > 0) return { names, summary: names.join(", ") };
  if (slot.filledCount > 0) {
    return {
      names: [],
      summary: slot.filledCount === 1 ? "1 assigned" : `${slot.filledCount} assigned`,
    };
  }
  return { names: [], summary: "0 assigned" };
}

function presentCoverage(
  coverage: RuntimeCoverageState,
  viewer: SpaceWorkspaceViewer,
): SpaceWorkspaceViewModel["coverage"] {
  if (coverage.availability === "feature_disabled") {
    return {
      availability: "feature_disabled",
      unavailable: true,
      noExpectation: false,
      slots: [],
      showSlotDetail: false,
    };
  }

  const evaluated = coverage.slots.filter((slot) => slot.state !== "NOT_APPLICABLE");
  const slots: SpaceWorkspaceCoverageSlotView[] = evaluated.map((slot) => {
    const assigned = assignedSummary(slot);
    return {
      expectationId: slot.expectationId,
      roleKey: slot.roleKey,
      roleLabel: slot.roleLabel,
      requiredCount: slot.requiredCount,
      filledCount: slot.filledCount,
      coverageLabel: coverageLabelForSlot(slot.state),
      state: slot.state,
      assigneeNames: assigned.names,
      assignedSummary: assigned.summary,
      isViewerSlot: Boolean(
        viewer.employeeId &&
          slot.assignmentRefs.some((row) => row.employeeId === viewer.employeeId),
      ),
    };
  });

  const noExpectation =
    coverage.availability === "no_published_expectations" ||
    coverage.availability === "not_applicable" ||
    (coverage.availability === "evaluated" && slots.length === 0);

  if (viewer.kind === "employee") {
    const mine = slots.filter((slot) => slot.isViewerSlot);
    return {
      availability: coverage.availability,
      unavailable: false,
      noExpectation: noExpectation && mine.length === 0,
      slots: mine,
      showSlotDetail: mine.length > 0,
    };
  }

  return {
    availability: coverage.availability,
    unavailable: false,
    noExpectation,
    slots,
    showSlotDetail: slots.length > 0,
  };
}

function evidenceHref(item: RuntimeEvidenceItem, viewer: SpaceWorkspaceViewer): {
  href: string | null;
  actionLabel: string | null;
} {
  const completed =
    item.productState === "COMPLETED" || item.productState === "COMPLETED_WITH_EXCEPTION";
  if (completed && item.href) {
    return {
      href: viewer.kind === "employee" ? null : item.href,
      actionLabel: viewer.kind === "employee" ? null : "View record",
    };
  }
  if (item.productState === "DUE" || item.productState === "OVERDUE") {
    const params = new URLSearchParams({
      attachmentId: item.attachmentId,
      requirementKey: item.requirementKey,
    });
    return {
      href: `/staffing/logs/open?${params.toString()}`,
      actionLabel: item.recordId ? "Continue log" : "Start log",
    };
  }
  if (item.productState === "UPCOMING") {
    const params = new URLSearchParams({
      attachmentId: item.attachmentId,
      requirementKey: item.requirementKey,
    });
    return {
      href: `/staffing/logs/open?${params.toString()}`,
      actionLabel: "Open log",
    };
  }
  if (
    (item.needsSupervisorReview || item.productState === "COMPLETED_WITH_EXCEPTION") &&
    item.href &&
    viewer.kind !== "employee"
  ) {
    return { href: item.href, actionLabel: "Review" };
  }
  return { href: item.href, actionLabel: null };
}

function windowLabel(item: RuntimeEvidenceItem): string | null {
  const start = formatLocalHhMm(item.window.start);
  const end = formatLocalHhMm(item.window.end);
  if (start && end) return `${start} – ${end}`;
  return start ?? end;
}

function presentEvidenceItem(
  item: RuntimeEvidenceItem,
  viewer: SpaceWorkspaceViewer,
  focusRequirementKey: string | null,
): SpaceWorkspaceEvidenceItemView {
  const action = evidenceHref(item, viewer);
  return {
    requirementKey: item.requirementKey,
    displayName: item.displayName,
    productState: item.productState,
    href: action.href,
    actionLabel: action.actionLabel,
    windowLabel: windowLabel(item),
    focused: focusRequirementKey === item.requirementKey,
  };
}

function presentEvidence(
  evidence: RuntimeEvidenceState,
  viewer: SpaceWorkspaceViewer,
  focusRequirementKey: string | null,
): SpaceWorkspaceEvidenceGroupView[] {
  const byKey = new Map(evidence.items.map((item) => [item.requirementKey, item]));
  const take = (keys: readonly string[]) =>
    keys
      .map((key) => byKey.get(key))
      .filter((item): item is RuntimeEvidenceItem => Boolean(item))
      .filter((item) => item.productState !== "NOT_APPLICABLE")
      .map((item) => presentEvidenceItem(item, viewer, focusRequirementKey));

  const attentionKeys = [
    ...new Set([...evidence.overdue, ...evidence.correctiveOpen, ...evidence.needsReview]),
  ];
  const dueKeys = evidence.dueNow.filter((key) => !attentionKeys.includes(key));
  const upcomingKeys = evidence.upcoming.filter((key) => !attentionKeys.includes(key));
  const completedKeys = evidence.completed.filter((key) => !attentionKeys.includes(key));

  const groups: SpaceWorkspaceEvidenceGroupView[] = [
    { id: "needs_attention", title: "Needs Attention", items: take(attentionKeys) },
    { id: "due_now", title: "Due Now", items: take(dueKeys) },
    { id: "upcoming", title: "Upcoming", items: take(upcomingKeys) },
    { id: "completed_today", title: "Completed Today", items: take(completedKeys) },
  ];
  return groups.filter((group) => group.items.length > 0);
}

function impactLabel(impact: AssetOperationalImpact): string {
  return IMPACT_LABEL[impact];
}

function presentAssets(
  state: RuntimeLocationState,
  unitId: string,
  spaceId: string,
): SpaceWorkspaceAssetView[] {
  const issuesByAsset = new Map<string, SpaceWorkspaceAssetIssueView[]>();
  const issueViews = (issue: RuntimeAssetIssueFact): SpaceWorkspaceAssetIssueView => ({
    issueId: issue.issueId,
    summary: issue.summary,
    impact: issue.impact,
    impactLabel: impactLabel(issue.impact),
    href: issue.href,
    operationalException:
      issue.impact === "SERVICE_AT_RISK" || issue.impact === "EQUIPMENT_UNAVAILABLE",
  });
  for (const issue of state.assets.openIssues) {
    const list = issuesByAsset.get(issue.assetId) ?? [];
    list.push(issueViews(issue));
    issuesByAsset.set(issue.assetId, list);
  }

  return state.assets.assets.map((asset: RuntimeAssetFact) => ({
    assetId: asset.assetId,
    name: asset.name,
    status: asset.status,
    statusLabel: ASSET_STATUS_LABEL[asset.status] ?? asset.status,
    openIssueCount: asset.openIssueCount,
    openWorkOrderCount: asset.openWorkOrderCount,
    href: `/assets/${asset.assetId}`,
    reportHref: `/unit/${unitId}?space=${encodeURIComponent(spaceId)}&reportAsset=${encodeURIComponent(asset.assetId)}#assets`,
    issues: issuesByAsset.get(asset.assetId) ?? [],
  }));
}

function presentMilestones(
  items: readonly RuntimeMilestoneItem[],
  timezone: string,
): SpaceWorkspaceMilestoneView[] {
  return items.map((item) => ({
    kind: item.kind,
    label: item.label,
    timing: {
      configured: formatLocalHhMm(item.timing.configured),
      adjusted: formatLocalHhMm(item.timing.adjusted),
      actual: formatLocalHhMm(item.timing.actual),
      recorded: item.timing.recordedAt ? formatClock(item.timing.recordedAt, timezone) : null,
    },
  }));
}

function presentChanges(
  changes: readonly RuntimeAdjustment[],
  timezone: string,
): SpaceWorkspaceChangeView[] {
  return [...changes]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((row) => ({
      atLabel: row.at.getTime() === 0 ? "" : formatClock(row.at, timezone),
      detail: row.detail,
    }));
}

function nextView(
  next: RuntimeNextEvent | null,
  timezone: string,
): SpaceWorkspaceViewModel["next"] {
  if (!next) return null;
  return {
    label: next.label,
    timeLabel: formatClock(next.at, timezone),
  };
}

function sectionOrder(viewer: SpaceWorkspaceViewer): SpaceWorkspaceSectionId[] {
  if (viewer.kind === "employee") {
    return ["overview", "evidence", "coverage", "assets", "milestones", "today"];
  }
  return ["overview", "coverage", "evidence", "assets", "milestones", "today"];
}

function resolveFocusSection(input: {
  unitTab?: string | null;
  evidenceKey?: string | null;
  reportAsset?: string | null;
}): SpaceWorkspaceSectionId | null {
  if (input.evidenceKey) return "evidence";
  if (input.reportAsset) return "assets";
  if (input.unitTab?.trim().toLowerCase() === "logs") return "evidence";
  return null;
}

export function presentSpaceWorkspace(
  state: RuntimeLocationState,
  options: {
    viewer: SpaceWorkspaceViewer;
    evidenceFocusKey?: string | null;
    unitTab?: string | null;
    reportAsset?: string | null;
  },
): SpaceWorkspaceViewModel {
  const viewer = options.viewer;
  const untyped = state.program.operationalType.state === "unassigned";
  const spaceId = state.identity.location.spaceId;
  const unitId = state.identity.location.unitId ?? "";
  const departmentId = state.identity.location.departmentId;
  const focusRequirementKey = options.evidenceFocusKey?.trim() || null;
  const coverage = presentCoverage(state.coverage, viewer);
  const todayItems = presentChanges(state.changes, state.asOf.timezone);
  const evidenceGroups = presentEvidence(state.evidence, viewer, focusRequirementKey);
  const milestones = presentMilestones(state.milestones.items, state.asOf.timezone);
  const configureHref =
    untyped && viewer.kind === "manager"
      ? departmentLocationsConfigureHref(departmentId)
      : null;
  const logBookHref =
    viewer.kind === "employee" ? null : `/staffing/logs/targets/space/${spaceId}`;
  const retiredLogsTab = options.unitTab?.trim().toLowerCase() === "logs";
  const order = sectionOrder(viewer);
  const showCoverageSection =
    coverage.unavailable || coverage.showSlotDetail || coverage.noExpectation;
  const presentById: Record<SpaceWorkspaceSectionId, boolean> = {
    overview: true,
    coverage: showCoverageSection,
    evidence: true,
    assets: state.assets.assets.length > 0 || state.assets.openIssues.length > 0,
    milestones: milestones.length > 0,
    today: todayItems.length > 0,
  };

  return {
    identity: {
      displayName: state.identity.displayName,
      breadcrumbs: breadcrumbs(state.identity),
      operationalTypeName: untyped ? null : state.program.operationalType.name,
      untyped,
    },
    operation: untyped
      ? {
          state: "NONE",
          label: SPACE_UNTYPED_LABEL,
          windowLabel: null,
          upcomingLabel: null,
        }
      : operationView(state.operation, state.asOf.timezone),
    exceptions: state.exceptions.map((row) => ({
      label: row.label,
      href: row.href,
      source: row.source,
    })),
    next: nextView(state.next, state.asOf.timezone),
    recentChanges: todayItems.slice(0, OVERVIEW_CHANGE_LIMIT),
    coverage,
    evidence: {
      groups: evidenceGroups,
      logBookHref,
      focusRequirementKey,
    },
    assets: {
      items: presentAssets(state, unitId, spaceId),
      maintenanceHref: "/assets",
    },
    milestones: {
      items: milestones,
      showServeryControls: milestones.some(
        (row) => row.kind === "SERVERY_READY" || row.kind === "MEAL_SERVICE_STARTED",
      ),
    },
    today: { items: todayItems },
    sections: order.map((id) => ({
      id,
      title:
        id === "overview"
          ? "Overview"
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
    configureHref,
    managerLinks: {
      logBookHref,
      maintenanceHref: "/assets",
      buildHref:
        viewer.kind === "manager"
          ? departmentLocationsConfigureHref(departmentId)
          : null,
    },
    retiredLogsTab,
    focusSectionId: resolveFocusSection({
      unitTab: options.unitTab,
      evidenceKey: focusRequirementKey,
      reportAsset: options.reportAsset,
    }),
  };
}

export function spaceWorkspaceAnchorId(section: SpaceWorkspaceSectionId): string {
  return section;
}

export function spaceWorkspaceEvidenceAnchorId(requirementKey: string): string {
  return `evidence-item-${requirementKey}`;
}
