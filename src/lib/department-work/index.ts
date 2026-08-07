/**
 * Phase 11A Dietary Department Work Plans — core library.
 *
 * Ownership:
 * - DepartmentWorkPlan owns versioned configuration (publish/retire).
 * - WorkRequirement is derived for an operational date (not pre-generated).
 * - DepartmentWorkOccurrence is sparse runtime state when acted on.
 * - KnowledgeArticle owns Procedures (viewing ≠ completion).
 * - Wave Task / Operations Engine remain isolated.
 *
 * Gate: DIETARY_WORK_PLANS_ENABLED (see isDietaryWorkPlansEnabled).
 */

export type {
  AcceptedEvidenceForWorkResolve,
  ConfirmedAssignmentForWorkResolve,
  ExistingWorkOccurrenceForResolve,
  OneOffWorkInput,
  PublishedCycleWindowForWorkResolve,
  PublishedWorkPlanForResolve,
  WorkItemDraftInput,
  WorkPlanApplicabilityDraftInput,
  WorkPlanDraftInput,
  WorkPlanListItem,
  WorkRequirement,
  WorkRequirementState,
} from "./types";

export {
  decideWorkAuthority,
  requireWorkComplete,
  requireWorkManage,
  requireWorkPublish,
  requireWorkSupervisorAction,
  resolveWorkAuthority,
  type WorkAuthorityDecision,
} from "./authority";

export { buildOccurrenceKey, type OccurrenceKeyParts } from "./occurrence-key";

export {
  buildWorkPlanPresetDraft,
  isDepartmentWorkPresetKey,
  listWorkPlanPresetSummaries,
  DEPARTMENT_WORK_PRESET_KEYS,
  type DepartmentWorkPresetKey,
} from "./work-presets";

export {
  createDraft,
  createDraftFromPreset,
  createSuccessorDraft,
  duplicateWorkPlan,
  loadBuilderWorkPlans,
  loadWorkPlanDetail,
  loadPublishedWorkPlansForDate,
  previewWorkPlanRequirements,
  publishWorkPlan,
  retireWorkPlan,
  updateDraft,
  type WorkActor,
} from "./work-plan-service";

export {
  resolveWorkRequirements,
  type AssetScopeForWorkResolve,
  type ResolveWorkRequirementsInput,
  type SpaceScopeForWorkResolve,
} from "./resolve-requirements";

export {
  cancelOneOff,
  completeExplicit,
  createOneOff,
  markNotRequired,
  reassignOccurrence,
  reopenOccurrence,
  type WorkOccurrenceActor,
} from "./occurrence-service";

export {
  loadExistingWorkOccurrencesForDate,
  loadPublishedWorkPlansForResolve,
  loadSupervisorWorkExceptions,
  loadWorkScopeForUnit,
  resolveUnitWorkRequirements,
  type ResolveUnitWorkRequirementsInput,
  type SupervisorWorkExceptionItem,
} from "./load-runtime-work";
