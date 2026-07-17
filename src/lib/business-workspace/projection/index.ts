/**
 * Wave 15K — Business Workspace Projection cutover (client-safe barrel).
 *
 * Pure adapters / intersection only. Server loaders live in `./load`.
 */

export type {
  BwActionEntry,
  BwAreaContributor,
  BwContributionKind,
  BwDepartmentSection,
  BwDestinationHandle,
  BwManagerSignalContributor,
  BwPerformanceDiagnostics,
  BwQueryScopesByDomain,
  BwToolEntry,
  ProjectedBusinessWorkspaceScope,
} from "./types";

export {
  adaptProjectionToBusinessWorkspace,
  contributionKindsFromContracts,
  emptyBusinessWorkspaceScope,
  resolveAllowedQuickActionIds,
} from "./adapt-projection";

export {
  countWorkspaceInputRows,
  intersectInputsToProjectedScope,
  resolveProjectedCompositionConfig,
} from "./intersect";
