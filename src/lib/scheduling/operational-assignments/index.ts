export type {
  AssignmentBoardEmployee,
  AssignmentBoardEntry,
  AssignmentWarning,
  AssignmentWarningKind,
  DailyAssignmentBoardData,
  ValidateAssignmentInput,
  ValidationResult,
} from "./types";

export { assignmentStatusLabel, isAssignmentActive } from "./assignment-status";
export { applyAssignmentTemplate, type ApplyTemplateInput } from "./apply-assignment-template";
export {
  recordAssignmentEvent,
  loadAssignmentEvents,
  type AssignmentEventType,
  type AssignmentEventView,
} from "./assignment-events";
export {
  resolveAssignmentAuthority,
  requireAssignmentManage,
  type AssignmentAuthorityDecision,
} from "./assignment-authority";
export {
  ensureAssignmentPlan,
  loadAssignmentPlanView,
  isPlanFrontlineVisible,
  type AssignmentPlanView,
} from "./assignment-plan";
export {
  buildDietaryCoverageSummary,
  type CoverageState,
  type CoverageSummary,
  type UnitCoverageRow,
} from "./build-coverage-summary";
export {
  buildLocationCoverageSummary,
  type LocationCoverageState,
  type LocationCoverageSummary,
  type LocationCoverageRow,
} from "./location-coverage";
export {
  deriveAssignmentScopeKind,
  loadAssignmentLocations,
  resolveAssignmentLocationWrites,
  resolveCoveredUnitSpaceIds,
  detectLocationResponsibilityOverlaps,
  assertNoLocationResponsibilityOverlaps,
  replaceAssignmentLocations,
  formatAssignmentLocationLabel,
  type AssignmentScopeKind,
  type ResolvedAssignmentLocation,
} from "./location-scope";
export {
  buildDeterministicLocationSequence,
  formatAssignedScopeSummary,
  type DeterministicSequence,
} from "./location-sequencing";
export {
  assertNoOverlappingActiveAssignments,
  lockEmployeeAssignmentDay,
} from "./enforce-overlap";
export {
  parseAssignmentWindowInstant,
  assertValidResponsibilityWindow,
  responsibilityWindowsOverlap,
} from "./responsibility-window";
export {
  buildAssignmentFulfillmentSummary,
  type AssignmentFulfillmentSummary,
  type FulfillmentPosition,
} from "./build-assignment-fulfillment";
export { suggestEmployeeForPosition } from "./build-assignment-suggestions";
export { detectOverlappingAssignments } from "./detect-assignment-conflicts";
export {
  loadAssignmentFormOptions,
  type AssignmentFormOptions,
} from "./load-assignment-form-options";
export {
  loadAssignmentTemplatePreview,
  type LoadTemplatePreviewInput,
} from "./load-assignment-template-preview";
export {
  loadDailyAssignmentBoard,
  type LoadDailyAssignmentBoardInput,
} from "./load-daily-assignment-board";
export {
  loadEmployeeAssignmentsToday,
  loadEmployeeAssignmentOfflineContext,
  type EmployeeAssignmentOfflineContext,
} from "./load-employee-assignments";
export {
  resolveCurrentEmployeeAssignment,
  type EmployeeAssignmentRow,
  type ResolvedCurrentAssignment,
} from "./resolve-current-assignment";
export type {
  TemplateView,
  TemplateItemView,
  TemplatePreview,
  TemplatePreviewPosition,
  ApplyTemplateResult,
} from "./template-types";
export { validateOperationalAssignment } from "./validate-operational-assignment";
