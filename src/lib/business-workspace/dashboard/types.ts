/**
 * Dashboard presentation of child SPACE Runtime Location State.
 * Not a runtime model. Not Site Pulse. Not a health score.
 */

export const DASHBOARD_NO_ACTIVE_OPERATION_LABEL = "No active operation";
export const DASHBOARD_COVERAGE_UNAVAILABLE_LABEL = "Coverage unavailable";
export const DASHBOARD_MULTIPLE_OPERATIONS_LABEL = "Multiple operations active";

export const DASHBOARD_INTERVENTION_LIMIT = 5;
export const DASHBOARD_UPCOMING_LIMIT = 3;

export type DashboardOperationKind = "shared" | "mixed" | "none";

export type DashboardCoverageView = {
  availability: "evaluated" | "feature_disabled" | "mixed" | "none";
  unavailable: boolean;
  summary: string;
  evaluatedCount: number;
  uncoveredSlotCount: number;
  atRiskSlotCount: number;
  disabledCount: number;
};

export type DashboardInterventionView = {
  id: string;
  spaceId: string;
  unitId: string;
  spaceName: string;
  label: string;
  source: string;
  state: string;
  href: string;
};

export type DashboardNextView = {
  label: string;
  spaceName: string;
  spaceId: string;
  unitId: string;
  timeLabel: string;
  href: string;
};

export type DashboardPaceCounts = {
  at_risk: number;
  on_time: number;
  ready: number;
  idle: number;
  unprogrammed: number;
};

export type DashboardWorkspaceViewModel = {
  spaceCount: number;
  operatingCount: number;
  attentionCount: number;
  overdueEvidenceCount: number;
  dueNowEvidenceCount: number;
  correctiveEvidenceCount: number;
  assetImpactCount: number;
  lateMilestoneCount: number;
  configurationCount: number;
  pace: DashboardPaceCounts;
  operation: {
    kind: DashboardOperationKind;
    label: string;
  };
  coverage: DashboardCoverageView;
  next: DashboardNextView | null;
  upcoming: DashboardNextView[];
  interventions: DashboardInterventionView[];
};
