export {
  effectiveCycleSpaceIds,
  buildCyclesByStableKey,
} from "./effective-cycle-spaces";

export type {
  CycleDraftInput,
  CycleUnitScope,
  CycleValidationIssue,
  CycleValidationResult,
  KeyTimeGroupDefinition,
  OperationalCycleContext,
  OperationalCycleDefinition,
  ResolvedCycleOccurrence,
  UnitMealTarget,
} from "./types";

export {
  decideCycleAuthority,
  requireCycleManage,
  requireCyclePublish,
  resolveCycleAuthority,
  type CycleAuthorityDecision,
} from "./cycle-authority";

export {
  formatLocalTime,
  isApplicableWeekday,
  isStructurallyOvernight,
  parseLocalTime,
  resolveCycleWindowInstants,
  weekdaySetsIntersect,
  windowsOverlap,
} from "./cycle-windows";

export {
  findOverlappingPublishedCycles,
  locationScopesIntersect,
  validateCycle,
  validateCycleForPublish,
  type PublishedCycleOverlapCandidate,
  type ValidateCycleInput,
} from "./validate-cycle";

export {
  validateDraftsForReviewPublish,
  reviewPublishHasBlockers,
  formatReviewPublishBlockerSummary,
  type ReviewPublishIssue,
  type ReviewPublishFixTarget,
  type ReviewPublishFixFocus,
  type ReviewPublishValidationResult,
} from "./review-publish-validation";

export {
  presentHierarchicalCycleReview,
  type HierarchicalReviewPresentation,
  type HierarchicalReviewBranch,
} from "./present-hierarchical-review";

/** Immediate publish testing override — not shown in production builds. */
export function isImmediatePublishTestingOverrideEnabled(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== "production";
}

export {
  cycleAppliesToUnit,
  cycleAppliesToSpace,
  describeOperationalCycleContext,
  DIETARY_CYCLE_UNIT_TYPES,
  formatCycleHierarchyLabel,
  resolveActiveCycleNodes,
  resolveOperationalCycle,
  summarizeActiveCycleContext,
} from "./resolve-operational-cycle";

export { loadPublishedCyclesForDate, loadPublishedCyclesWithKeyTimesForDate } from "./load-published-cycles";

export {
  detectRunModelProvenance,
  presentDepartmentRunOperation,
  presentLocationRunOperation,
  serializeLocationRunProof,
  timingsForPublishedKeyTimeCycles,
  currentPublishedKeyTimeTimings,
  selectCurrentDayKeyTimeGroups,
  type CurrentDayKeyTimeGroupSummary,
  type RunDepartmentOperationPresentation,
  type RunLocationOperationPresentation,
  type RunLocationIdentity,
  type RunModelProvenance,
} from "./present-run-operation";

export {
  loadDepartmentRunPresentation,
  loadLocationRunPresentation,
  loadPublishedRunModel,
  loadRoomRunIdentity,
  refreshTodayKeyTimesAfterImmediatePublish,
  resolveRunPresentationDepartment,
  resolveSelectedRoomForUnit,
  resolveUnitWorkspaceRunContext,
  type SelectedRoomResolution,
  type UnitWorkspaceRunContext,
} from "./load-run-operation-presentation";


export {
  addMinutesToLocalTime,
  describeMealServiceTiming,
  expectedTodayTime,
  formatClock12,
  localHhMmFromInstant,
  type DayMealTiming,
  type MealServiceTimingStatus,
} from "./day-expectation";

export {
  describeKeyTimeStatus,
  expectedKeyTimeToday,
  summarizeKeyTimeGroups,
  type KeyTimeDayTiming,
  type KeyTimeGroupSummary,
  type KeyTimeStatus,
  type KeyTimeStatusKey,
} from "./key-time-day-expectation";

export { planKeyTimeDayExpectations } from "./plan-key-time-day-expectations";

export {
  materializeKeyTimeDayExpectations,
  timingsForSpaces as keyTimeTimingsForSpaces,
  timingsForOwnerUnits as keyTimeTimingsForOwnerUnits,
} from "./materialize-key-time-day-expectations";

export {
  adjustKeyTimeDayExpectation,
  completeKeyTimeDayExpectation,
  decideCompleteKeyTimeAuthority,
} from "./key-time-day-actions";

export {
  materializeMealServiceDayExpectations,
  mealTargetsFromTimings,
  indexTimingsByUnitMeal,
  timingsForOwnerUnits,
  configuredMealTypesFromTimings,
} from "./materialize-day-expectations";

export {
  adjustMealServiceDayExpectation,
  decideAdjustDayExpectationAuthority,
} from "./adjust-day-expectation";

export {
  planMealServiceDayExpectations,
  pickTimingForMeal,
  timingOwnerUnitIds,
} from "./plan-day-expectations";

export {
  dayAfter,
  dayBefore,
  effectiveDateRangesOverlap,
  isCycleEffectiveOnDate,
  latestDraftEditedAt,
  latestDraftsByStableKey,
  minimumPublishEffectiveFrom,
  nextOperationalDayKey,
  partitionCyclesForLifecycle,
  reviewDraftChangesAgainstCurrent,
  type CycleDraftChange,
  type CycleDraftChangeKind,
  type CycleLifecycleBucket,
  type CycleLifecycleRow,
} from "./cycle-lifecycle";

export {
  formatCycleOverviewSummary,
  isTrueCycleFirstSetup,
  shouldShowCycleCurrentSection,
  shouldShowCycleDraftSection,
  shouldShowCycleHistorySection,
  shouldShowCycleScheduledSection,
  type CycleLifecyclePresence,
} from "./cycle-ui";

export {
  canDestructivelyDeleteCycle,
  createDraft,
  deleteDraft,
  discardAllDrafts,
  duplicateCycle,
  generateDietaryDefaultsDrafts,
  generateEvsDefaultsDrafts,
  orderDraftSubtreeForDelete,
  publishCycle,
  reorderDrafts,
  applyDraftTreeMove,
  retireCycle,
  scheduleDraftPublications,
  updateDraft,
  type CycleActor,
} from "./cycle-service";

export {
  loadCycleBuilder,
  type CycleBuilderCatalog,
  type CycleBuilderDayPreview,
  type CycleBuilderRow,
} from "./load-cycle-builder";

export {
  projectCycleHierarchy,
  wouldCreateHierarchyCycle,
  effectiveMealType,
  parentOptionsForCycle,
  ancestorStableKeysFor,
  type CycleHierarchyTreeNode,
  type CycleHierarchyProjection,
} from "./cycle-hierarchy";

export {
  computeCycleTreeMove,
  type CycleTreeMovePlacement,
  type CycleTreeMoveResult,
} from "./cycle-tree-move";

export {
  describeUserFacingScope,
  groupCyclesForList,
  locationModeFromUserScope,
  locationNameMap,
  mealTimeNeighborhoodCandidates,
  parseServiceStartTimesField,
  scopeGroupLabel,
  shouldShowServiceStartTimes,
  standardRoomTypeOptions,
  userFacingScopeFromMode,
  type CycleScopeLocationOption,
  type CycleUserScope,
} from "./cycle-scope";

export {
  loadEmployeeCycleContext,
  type EmployeeCycleContextCard,
  type EmployeeKeyTimeCard,
} from "./load-employee-cycle-context";

export {
  loadSupervisorCycleOverview,
  type SupervisorCycleOverview,
  type SupervisorUnitCycleRow,
  type SupervisorKeyTimeGroupCard,
  type SupervisorKeyTimeRoomRow,
} from "./load-supervisor-cycle-overview";

export { loadGmCycleSummary, type GmCycleSummary } from "./load-gm-cycle-summary";

export {
  cycleMilestoneStatusLabel,
  resolveCycleMilestoneStatus,
  type CycleMilestoneStatus,
  type CycleMilestoneStatusKey,
  type MilestoneStatusInput,
  type ServeryEventMilestoneSnapshot,
} from "./milestone-cycle-status";

export {
  buildDietaryStarterPreview,
  dietaryStarterPlansToCreate,
  dietaryStarterWouldCreateCount,
  departmentHasCycleConfiguration,
  type DietaryStarterPreviewNode,
} from "./dietary-starter";

export {
  buildDietaryDefaultCyclePlans,
  buildEvsDefaultCyclePlans,
  type DietaryDefaultCyclePlan,
  type EvsDefaultCyclePlan,
} from "./defaults";

export {
  collectExistingCycleIdentity,
  collectExistingCycleStableKeys,
  formatCycleClock,
  formatCycleRowSecondary,
  formatCycleWindow,
  formatDaysSummary,
  formatMealLabel,
  formatServiceDateLong,
  moveOrderedId,
  normalizeCycleLabel,
  presentCycleReview,
  previewDietaryDefaultsAgainstExisting,
  serializeDaysOfWeek,
  WEEKDAY_SHORT,
  type DefaultPreviewRow,
  type ReviewPresentation,
} from "./cycle-display";

export {
  cycleRootToTemporalStrip,
  cyclesToTemporalStrips,
  type CycleTemporalInputRow,
} from "./cycle-temporal-strip";
