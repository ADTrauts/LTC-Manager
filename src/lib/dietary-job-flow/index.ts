/**
 * Phase 9B Dietary Employee Job Flow — derived Runtime projection.
 *
 * Ownership (locked):
 * - Job Flow does NOT own Assignment, Cycle, MealTime, Milestone, Coverage, or Offline.
 * - No JobFlowRecord / no migration.
 * - No Employee acknowledgment persistence (revision indicator + refresh).
 * - OPERATION_ENGINE_ENABLED stays false; use DIETARY_JOB_FLOW_ENABLED.
 */

export type {
  JobFlowAttentionItem,
  JobFlowAttentionKind,
  JobFlowAssignmentSnapshot,
  JobFlowContext,
  JobFlowCurrent,
  JobFlowCycleSnapshot,
  JobFlowMilestoneState,
  JobFlowNext,
  JobFlowPhaseStatus,
  JobFlowProgressPhase,
  JobFlowState,
  JobFlowSyncState,
  JobFlowUnitSnapshot,
  SupervisorBoardSummaryCounts,
  SupervisorBoardUnitRow,
  SupervisorExceptionGroup,
  SupervisorExceptionItem,
  SupervisorExceptionTemporal,
  SupervisorOperationsBoard,
} from "./types";

export { DUE_SOON_MS } from "./types";

export {
  decideJobFlowAuthority,
  requireSupervisorBoard,
  resolveJobFlowAuthority,
  type JobFlowAuthorityDecision,
} from "./job-flow-authority";

export {
  resolveCurrentExpectation,
  type ExpectationInput,
  type ExpectationResult,
} from "./expectation";

export {
  resolveJobFlow,
  type JobFlowOfflineQueueSummary,
  type JobFlowResolveInput,
} from "./resolve-job-flow";

export {
  detectAssignmentRevision,
  type AssignmentRevisionCurrent,
  type AssignmentRevisionKind,
  type AssignmentRevisionPrior,
  type AssignmentRevisionResult,
} from "./assignment-revision";

export {
  loadEmployeeJobFlow,
  type LoadEmployeeJobFlowInput,
} from "./load-employee-job-flow";

export {
  loadSupervisorOperationsBoard,
  type LoadSupervisorOperationsBoardInput,
} from "./load-supervisor-operations-board";
