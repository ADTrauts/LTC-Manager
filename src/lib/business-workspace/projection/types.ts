/**
 * Wave 15K — Business Workspace Projection scope.
 *
 * Projection supplies eligibility + manager signal contributors.
 * Engines supply live truth. Workspace owns personal ranking/presentation.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type { ExperienceToolKey } from "@/lib/experiences";
import type {
  ProjectionDiagnostic,
  ProjectionPlantPolicy,
  ProjectionQueryScope,
} from "@/lib/projection";

/** Signal families that may contribute to manager Workspace sections. */
export type BwContributionKind =
  | "readiness"
  | "outstanding_work"
  | "inspections"
  | "issues_repairs"
  | "staffing"
  | "operations"
  | "compliance_logs"
  | "assignments"
  | "assets"
  | "navigation";

export type BwActionEntry = {
  key: string;
  label: string;
};

export type BwToolEntry = {
  key: ExperienceToolKey;
  name: string;
};

export type BwDestinationHandle = {
  id: string;
  label: string;
  href: string | null;
  experienceKey: string;
  /** True when href comes from a compatibility route map, not a live Experience dest. */
  compatibility: boolean;
};

export type BwManagerSignalContributor = {
  id: string;
  experienceKey: string;
  label: string;
  order: number;
  areaKey: string;
  departmentKey: OperationalDepartmentKey | null;
  unitIds: readonly string[];
  spaceIds: readonly string[];
  domains: readonly string[];
  tools: readonly BwToolEntry[];
  actions: readonly BwActionEntry[];
  allowedActionKeys: readonly string[];
  readinessSignalKeys: readonly string[];
  contributionKinds: readonly BwContributionKind[];
  destinationHandles: readonly BwDestinationHandle[];
};

export type BwAreaContributor = {
  areaKey: string;
  label: string;
  order: number;
  experiences: readonly BwManagerSignalContributor[];
};

export type BwDepartmentSection = {
  departmentKey: OperationalDepartmentKey | null;
  label: string | null;
  areas: readonly BwAreaContributor[];
  plantPolicy: ProjectionPlantPolicy | null;
  projectedUnitIds: readonly string[];
  actionableUnitIds: readonly string[];
};

export type BwQueryScopesByDomain = Readonly<
  Record<string, readonly ProjectionQueryScope[]>
>;

export type BwPerformanceDiagnostics = {
  projectionDurationMs: number | null;
  liveInputDurationMs: number | null;
  compositionDurationMs: number | null;
  projectedLocationCount: number;
  projectedExperienceCount: number;
  domainRowCountsBeforeIntersection: number | null;
  domainRowCountsAfterIntersection: number | null;
};

export type ProjectedBusinessWorkspaceScope = {
  facilityId: string;
  lensMode: "DEPARTMENT" | "FACILITY";
  lensKey: string;
  departmentKey: OperationalDepartmentKey | null;
  departmentSections: readonly BwDepartmentSection[];
  projectedUnitIds: readonly string[];
  projectedSpaceIds: readonly string[];
  projectedAreaKeys: readonly string[];
  projectedExperienceKeys: readonly string[];
  managerSignalContributors: readonly BwManagerSignalContributor[];
  queryScopesByDomain: BwQueryScopesByDomain;
  readinessSignalKeys: readonly string[];
  allowedQuickActionIds: readonly string[];
  destinationHandles: readonly BwDestinationHandle[];
  showLogCompletion: boolean;
  showMealContext: boolean;
  plantPolicy: ProjectionPlantPolicy | null;
  diagnostics: readonly ProjectionDiagnostic[];
  performance: BwPerformanceDiagnostics;
  error: string | null;
};
