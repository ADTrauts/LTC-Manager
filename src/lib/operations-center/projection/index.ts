/**
 * Wave 15J — Operations Center Projection cutover (client-safe barrel).
 *
 * Pure adapters / intersection only. Server loaders live in `./load`
 * and must be imported from there (or via a Server Component) so
 * `next/headers` never enters the client graph.
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
