/**
 * Wave 15J — Operations Center Projection scope.
 *
 * Projection supplies eligibility + Experience contribution handles.
 * Engines supply live readiness / staffing / issues / inspections / operations.
 * Operations Center only aggregates and presents within this scope.
 */

import type { OperationalDepartmentKey } from "@/lib/department-nav";
import type { ExperienceToolKey } from "@/lib/experiences";
import type {
  ProjectionDiagnostic,
  ProjectionPlantPolicy,
  ProjectionQueryScope,
} from "@/lib/projection";

import type { OperationsCenterCardId } from "../card-registry";

/** Signal groups an Experience may contribute to Operations Center. */
export type OcContributionKind =
  | "readiness"
  | "outstanding_work"
  | "inspections"
  | "issues_repairs"
  | "staffing"
  | "operations"
  | "compliance_logs"
  | "navigation";

export type OcActionEntry = {
  key: string;
  label: string;
};

export type OcToolEntry = {
  key: ExperienceToolKey;
  name: string;
};

export type OcDestinationHandle = {
  id: string;
  label: string;
  href: string | null;
  experienceKey: string;
};

export type OcExperienceContributor = {
  id: string;
  experienceKey: string;
  label: string;
  order: number;
  areaKey: string;
  departmentKey: OperationalDepartmentKey | null;
  unitIds: readonly string[];
  spaceIds: readonly string[];
  domains: readonly string[];
  tools: readonly OcToolEntry[];
  actions: readonly OcActionEntry[];
  allowedActionKeys: readonly string[];
  readinessSignalKeys: readonly string[];
  contributionKinds: readonly OcContributionKind[];
  destinationHandles: readonly OcDestinationHandle[];
};

export type OcAreaContributor = {
  areaKey: string;
  label: string;
  order: number;
  experiences: readonly OcExperienceContributor[];
};

/** One labeled department contribution (Facility Overview or single lens). */
export type OcDepartmentSection = {
  departmentKey: OperationalDepartmentKey | null;
  label: string | null;
  areas: readonly OcAreaContributor[];
  plantPolicy: ProjectionPlantPolicy | null;
  projectedUnitIds: readonly string[];
  actionableUnitIds: readonly string[];
};

export type OcQueryScopesByDomain = Readonly<
  Record<string, readonly ProjectionQueryScope[]>
>;

export type OcPerformanceDiagnostics = {
  projectionDurationMs: number | null;
  dashboardQueryDurationMs: number | null;
  readinessDurationMs: number | null;
  compositionDurationMs: number | null;
  projectedLocationCount: number;
  projectedExperienceCount: number;
  domainRowCountsBeforeIntersection: number | null;
  domainRowCountsAfterIntersection: number | null;
};

export type ProjectedOperationsCenterScope = {
  facilityId: string;
  lensMode: "DEPARTMENT" | "FACILITY";
  lensKey: string;
  departmentKey: OperationalDepartmentKey | null;
  departmentSections: readonly OcDepartmentSection[];
  projectedUnitIds: readonly string[];
  projectedSpaceIds: readonly string[];
  projectedAreaKeys: readonly string[];
  projectedExperiences: readonly string[];
  experienceContributors: readonly OcExperienceContributor[];
  readinessSignalKeys: readonly string[];
  queryScopesByDomain: OcQueryScopesByDomain;
  allowedActions: readonly OcActionEntry[];
  destinationHandles: readonly OcDestinationHandle[];
  /** Eligible OC cards derived from Experience contributions (not legacy caps). */
  eligibleCardIds: readonly OperationsCenterCardId[];
  plantPolicy: ProjectionPlantPolicy | null;
  diagnostics: readonly ProjectionDiagnostic[];
  performance: OcPerformanceDiagnostics;
  error: string | null;
};
