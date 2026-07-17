/**
 * Wave 15J — Operations Center Projection cutover.
 */

export type {
  OcActionEntry,
  OcAreaContributor,
  OcContributionKind,
  OcDepartmentSection,
  OcDestinationHandle,
  OcExperienceContributor,
  OcPerformanceDiagnostics,
  OcQueryScopesByDomain,
  OcToolEntry,
  ProjectedOperationsCenterScope,
} from "./types";

export {
  adaptProjectionToOperationsCenter,
  contributionKindsFromContracts,
  emptyOperationsCenterScope,
  resolveEligibleOcCards,
} from "./adapt-projection";

export {
  applyProjectedScopeToDashboard,
  filterCallDownsToProjectedUnits,
  intersectDashboardQueriesToProjectedUnits,
  measureDomainRowIntersection,
} from "./intersect";

export {
  assembleProjectedOperationsCenter,
  loadOperationsCenterProjection,
  type AssembledOperationsCenter,
  type LoadOperationsCenterProjectionOptions,
} from "./load";
