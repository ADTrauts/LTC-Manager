/**
 * SPACE workspace presentation. Labels, grouping, role density.
 * Does not query or recalculate Runtime Location State.
 */

import type { CanonicalCoverageState } from "@/lib/scheduling/coverage-expectations";
import type { AssetOperationalImpact } from "@prisma/client";
import type { AssetOperationalStatus } from "@/lib/asset-operations/types";
import type { LogRequirementProductState } from "@/lib/logs-architecture/types";

export const SPACE_NO_ACTIVE_OPERATION_LABEL = "No active operation";
export const SPACE_UNTYPED_LABEL = "Operational Type not assigned";
export const SPACE_COVERAGE_UNAVAILABLE_LABEL = "Coverage unavailable";
export const SPACE_NO_COVERAGE_EXPECTATION_LABEL = "No coverage expectation";

export const SPACE_SECTION_IDS = [
  "overview",
  "coverage",
  "evidence",
  "assets",
  "milestones",
  "today",
] as const;

export type SpaceWorkspaceSectionId = (typeof SPACE_SECTION_IDS)[number];

export type SpaceWorkspaceViewerKind = "employee" | "supervisor" | "manager";

export type SpaceWorkspaceViewer = {
  kind: SpaceWorkspaceViewerKind;
  authMethod: "PASSWORD" | "QUICK_PIN";
  employeeId: string | null;
};

export type SpaceWorkspaceBreadcrumb = {
  label: string;
  grain: "floor" | "neighborhood" | "unit" | "space";
};

export type SpaceWorkspaceExceptionView = {
  label: string;
  href: string | null;
  source: string;
};

export type SpaceWorkspaceCoverageSlotView = {
  expectationId: string;
  roleKey: string;
  roleLabel: string;
  requiredCount: number;
  filledCount: number;
  coverageLabel: string;
  state: CanonicalCoverageState;
  assigneeNames: string[];
  assignedSummary: string;
  isViewerSlot: boolean;
};

export type SpaceWorkspaceEvidenceItemView = {
  requirementKey: string;
  displayName: string;
  productState: LogRequirementProductState;
  href: string | null;
  actionLabel: string | null;
  windowLabel: string | null;
  focused: boolean;
};

export type SpaceWorkspaceEvidenceGroupId =
  | "needs_attention"
  | "due_now"
  | "upcoming"
  | "completed_today";

export type SpaceWorkspaceEvidenceGroupView = {
  id: SpaceWorkspaceEvidenceGroupId;
  title: string;
  items: SpaceWorkspaceEvidenceItemView[];
};

export type SpaceWorkspaceAssetIssueView = {
  issueId: string;
  summary: string;
  impact: AssetOperationalImpact;
  impactLabel: string;
  href: string | null;
  operationalException: boolean;
};

export type SpaceWorkspaceAssetView = {
  assetId: string;
  name: string;
  status: AssetOperationalStatus;
  statusLabel: string;
  openIssueCount: number;
  openWorkOrderCount: number;
  href: string;
  reportHref: string;
  issues: SpaceWorkspaceAssetIssueView[];
};

export type SpaceWorkspaceMilestoneTimingView = {
  configured: string | null;
  adjusted: string | null;
  actual: string | null;
  recorded: string | null;
};

export type SpaceWorkspaceMilestoneView = {
  kind: "KEY_TIME" | "SERVERY_READY" | "MEAL_SERVICE_STARTED";
  label: string;
  timing: SpaceWorkspaceMilestoneTimingView;
};

export type SpaceWorkspaceChangeView = {
  atLabel: string;
  detail: string;
};

export type SpaceWorkspaceSectionView = {
  id: SpaceWorkspaceSectionId;
  title: string;
  present: boolean;
};

export type SpaceWorkspaceViewModel = {
  identity: {
    displayName: string;
    breadcrumbs: SpaceWorkspaceBreadcrumb[];
    operationalTypeName: string | null;
    untyped: boolean;
  };
  operation: {
    state: "ACTIVE" | "NONE";
    label: string;
    windowLabel: string | null;
    upcomingLabel: string | null;
  };
  exceptions: SpaceWorkspaceExceptionView[];
  next: { label: string; timeLabel: string } | null;
  recentChanges: SpaceWorkspaceChangeView[];
  coverage: {
    availability: "evaluated" | "feature_disabled" | "no_published_expectations" | "not_applicable";
    unavailable: boolean;
    noExpectation: boolean;
    slots: SpaceWorkspaceCoverageSlotView[];
    showSlotDetail: boolean;
  };
  evidence: {
    groups: SpaceWorkspaceEvidenceGroupView[];
    logBookHref: string | null;
    focusRequirementKey: string | null;
  };
  assets: {
    items: SpaceWorkspaceAssetView[];
    maintenanceHref: string;
  };
  milestones: {
    items: SpaceWorkspaceMilestoneView[];
    showServeryControls: boolean;
  };
  today: {
    items: SpaceWorkspaceChangeView[];
  };
  sections: SpaceWorkspaceSectionView[];
  sectionOrder: SpaceWorkspaceSectionId[];
  configureHref: string | null;
  managerLinks: {
    logBookHref: string | null;
    maintenanceHref: string;
    buildHref: string | null;
  };
  retiredLogsTab: boolean;
  focusSectionId: SpaceWorkspaceSectionId | null;
};
