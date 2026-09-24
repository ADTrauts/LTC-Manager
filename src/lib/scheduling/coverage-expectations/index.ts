export type {
  CanonicalCoverageState,
  CoverageAssignmentActual,
  CoverageCycleRef,
  CoverageExpectationItemInput,
  CoverageExpectationStatus,
  CoverageLocationContext,
  CoveragePerspective,
  CoveragePlanLifecycle,
  CoverageProvenanceSource,
  ResolvedCoverageExpectation,
} from "./types";
export {
  dayAfter,
  dayBefore,
  flattenCoverageTemplateItems,
  isCoverageTemplateEffectiveOnDate,
  isHistoricalCoverageTemplateEffectiveOnDate,
  resolveCoveragePublishEffectiveFromKey,
  selectCoverageTemplatesForPerspective,
  selectHistoricalCoverageTemplates,
  selectRuntimeCoverageTemplates,
  selectWorkingCoverageTemplates,
  type CoverageTemplateVersionRow,
  type HistoricalCoverageSelection,
} from "./publication";
export {
  dedupeResolvedExpectations,
  describeCoverageApplicability,
  itemTargetsCycle,
  matchCoverageItemToLocation,
  resolveCoverageExpectationsForLocation,
  validateCoverageCycleStableKeys,
  validateCoverageOperationalTypeKeys,
} from "./match-expectation";
export {
  assignmentCoversLocation,
  assignmentOverlapsCycle,
  evaluateCoverageSlotState,
  evaluateCoverageSlots,
  matchingAssignmentsForSlot,
  planLifecycleFromStatus,
  type EvaluatedCoverageSlot,
} from "./evaluate-coverage";
export {
  decideCoverageAuthority,
  requireCoverageManage,
  resolveCoverageAuthority,
  type CoverageAuthorityDecision,
} from "./authority";
export {
  loadCoverageCatalog,
  loadWorkingCoverageExpectations,
  toCoverageExpectationView,
} from "./load-coverage";
// service.ts is server-only (Prisma + `@/lib/auth` / `next/headers`).
// Import writes from `@/lib/scheduling/coverage-expectations/service`.
export type {
  CoverageCatalog,
  CoverageCycleOption,
  CoverageExpectationItemView,
  CoverageExpectationView,
  CoverageOperationalTypeOption,
  CoverageRoleOption,
} from "./views";
