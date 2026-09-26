/**
 * Neighborhood workspace presentation. Aggregation of child SPACE RLS.
 * Not a Runtime Location State. Not an Operational Type.
 */

import type { ExceptionFirstLocationCardView } from "@/lib/locations/exception-first";
import type { LocationLandingRowState } from "@/lib/locations/landing";
import type { AssetOperationalImpact } from "@prisma/client";
import type { AssetOperationalStatus } from "@/lib/asset-operations/types";
import type { LogRequirementProductState } from "@/lib/logs-architecture/types";
import type { SpaceWorkspaceViewer } from "@/lib/unit-workspace/space";

export const NEIGHBORHOOD_NO_ACTIVE_OPERATION_LABEL = "No active operation";
export const NEIGHBORHOOD_COVERAGE_UNAVAILABLE_LABEL = "Coverage unavailable";
export const NEIGHBORHOOD_NO_OPERATIONAL_SPACES_COPY =
  "No operational spaces are configured for this location.";

export const NEIGHBORHOOD_SECTION_IDS = [
  "overview",
  "spaces",
  "coverage",
  "evidence",
  "assets",
  "milestones",
  "today",
] as const;

export type NeighborhoodWorkspaceSectionId = (typeof NEIGHBORHOOD_SECTION_IDS)[number];

export type NeighborhoodWorkspaceViewer = SpaceWorkspaceViewer;

export type NeighborhoodSpaceRowView = {
  spaceId: string;
  unitId: string;
  name: string;
  href: string;
  landing: LocationLandingRowState;
  card: ExceptionFirstLocationCardView;
};

export type NeighborhoodExceptionView = {
  spaceId: string;
  spaceName: string;
  label: string;
  source: string;
  state: string;
  href: string | null;
};

export type NeighborhoodCoverageView = {
  availability: "evaluated" | "feature_disabled" | "mixed" | "none";
  unavailable: boolean;
  summary: string | null;
  evaluatedCount: number;
  coveredCount: number;
  uncoveredCount: number;
  disabledCount: number;
};

export type NeighborhoodEvidenceItemView = {
  spaceId: string;
  spaceName: string;
  requirementKey: string;
  displayName: string;
  productState: LogRequirementProductState;
  href: string;
  actionHref: string | null;
  actionLabel: string | null;
};

export type NeighborhoodEvidenceGroupView = {
  id: "needs_attention" | "due_now" | "upcoming" | "completed_today";
  title: string;
  items: NeighborhoodEvidenceItemView[];
};

export type NeighborhoodAssetView = {
  spaceId: string;
  spaceName: string;
  assetId: string;
  name: string;
  status: AssetOperationalStatus;
  statusLabel: string;
  openIssueCount: number;
  openWorkOrderCount: number;
  href: string;
  issues: Array<{
    issueId: string;
    summary: string;
    impact: AssetOperationalImpact;
    impactLabel: string;
    operationalException: boolean;
    href: string | null;
  }>;
};

export type NeighborhoodMilestoneView = {
  spaceId: string;
  spaceName: string;
  kind: "KEY_TIME" | "SERVERY_READY" | "MEAL_SERVICE_STARTED";
  label: string;
  configured: string | null;
  adjusted: string | null;
  actual: string | null;
};

export type NeighborhoodChangeView = {
  spaceId: string;
  spaceName: string;
  atLabel: string;
  detail: string;
};

export type NeighborhoodWorkspaceViewModel = {
  identity: {
    unitId: string;
    displayName: string;
    breadcrumbs: Array<{ label: string; grain: "floor" | "neighborhood" | "unit" }>;
  };
  spaceCount: number;
  attentionCount: number;
  atRiskCount: number;
  overdueEvidenceCount: number;
  operation: {
    kind: "shared" | "mixed" | "none";
    label: string;
  };
  next: { label: string; spaceName: string; timeLabel: string } | null;
  exceptions: NeighborhoodExceptionView[];
  spaces: NeighborhoodSpaceRowView[];
  coverage: NeighborhoodCoverageView;
  evidence: {
    groups: NeighborhoodEvidenceGroupView[];
    overdueCount: number;
  };
  assets: NeighborhoodAssetView[];
  milestones: NeighborhoodMilestoneView[];
  today: NeighborhoodChangeView[];
  sections: Array<{ id: NeighborhoodWorkspaceSectionId; title: string; present: boolean }>;
  sectionOrder: NeighborhoodWorkspaceSectionId[];
  retiredLogsTab: boolean;
  focusSectionId: NeighborhoodWorkspaceSectionId | null;
  showDetailedCoverage: boolean;
  managerLinks: {
    maintenanceHref: string | null;
    logBookHref: string | null;
  };
  emptySpaces: {
    copy: string;
    facilityBuilderHref: string | null;
    departmentLocationsHref: string | null;
  } | null;
};
