/**
 * Runtime Location State — derived SPACE-grain operational composition.
 *
 * Migrated Today's Work facts (operating-location board only):
 * - operation  ← presentLocationRunOperation / resolveOperationalCycle
 * - coverage   ← Phase 5B evaluateCoverage (OA flag off = feature_disabled)
 * - evidence   ← Harbor Catalog + LogAttachment due-state
 * - assets     ← asset placement + issue operationalImpact
 * - milestones ← Key Times (canonical) + Servery Ready/Started (legacy)
 *
 * Dashboard `/workspace` consumes this batch as a pure aggregation (Phase 6H).
 *
 * Review /logs still use LogAssignment expected-log math. Presence uses
 * ScheduleEntry. Job Flow composes EmployeeRuntimeFlow from this batch.
 */

export type {
  LoadRuntimeLocationStatesInput,
  RuntimeAdjustment,
  RuntimeAssetFact,
  RuntimeAssetIssueFact,
  RuntimeAssetState,
  RuntimeCoverageAssignmentRef,
  RuntimeCoverageAvailability,
  RuntimeCoverageSlot,
  RuntimeCoverageState,
  RuntimeCurrentOperation,
  RuntimeEffectiveProgramRef,
  RuntimeEvidenceItem,
  RuntimeEvidenceState,
  RuntimeException,
  RuntimeExceptionSource,
  RuntimeLocationAsOf,
  RuntimeLocationId,
  RuntimeLocationIdentity,
  RuntimeLocationKind,
  RuntimeLocationPrefetchStats,
  RuntimeLocationSpaceRef,
  RuntimeLocationState,
  RuntimeMilestoneItem,
  RuntimeMilestoneKind,
  RuntimeMilestoneState,
  RuntimeNextEvent,
  RuntimeNextEventKind,
  RuntimeReadinessState,
  RuntimeTimeTriple,
} from "./types";
export { DEFERRED_READINESS } from "./types";

export {
  composeRuntimeLocationState,
  composeRuntimeLocationStates,
  type RuntimeLocationComposeInput,
  type RuntimePublishedRunModel,
  type RuntimeSpaceIdentityRow,
} from "./compose";

export { deriveRuntimeExceptions, exceptionSortRank } from "./exceptions";
export { deriveRuntimeNextEvent } from "./next-event";
export {
  resolveEvidenceRequirementsForSpaces,
  summarizeRuntimeEvidence,
} from "./evidence";
export {
  loadRuntimeLocationState,
  loadRuntimeLocationStates,
  type LoadedRuntimeLocationStates,
} from "./load";
export { prefetchRuntimeLocationInputs } from "./prefetch";
