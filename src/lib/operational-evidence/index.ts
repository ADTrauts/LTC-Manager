/**
 * Phase 9C Dietary Operational Evidence — core library.
 *
 * Requirements are derived for an operational date (not persisted).
 * Records are durable with templateSnapshotJson.
 * Legacy LogTemplate / InspectionDefinition are untouched.
 * OPERATION_ENGINE_ENABLED stays false; use DIETARY_OPERATIONAL_EVIDENCE_ENABLED.
 */

export type {
  CorrectEvidenceInput,
  EvidenceFieldValueInput,
  EvidenceLogBookFilters,
  EvidenceRequirement,
  EvidenceRequirementState,
  EvidenceSubmissionValidationResult,
  ExistingEvidenceRecordForResolve,
  PublishedCycleWindowForResolve,
  PublishedTemplateForResolve,
  SubmitEvidenceInput,
  TemplateApplicabilityDraftInput,
  TemplateDraftInput,
  TemplateFieldDraftInput,
  TemplateFieldSnapshot,
  TemplateScheduleDraftInput,
  TemplateSnapshotJson,
  TemplateValidationIssue,
  TemplateValidationResult,
} from "./types";

export {
  decideEvidenceAuthority,
  requireEvidenceCorrect,
  requireEvidenceLogBook,
  requireEvidenceManage,
  requireEvidencePublish,
  requireEvidenceSubmit,
  resolveEvidenceAuthority,
  type EvidenceAuthorityDecision,
} from "./evidence-authority";

export {
  validateTemplate,
  validateTemplateApplicability,
  validateTemplateField,
  validateTemplateForPublish,
  validateTemplateSchedule,
} from "./validate-template";

export { validateEvidenceSubmission } from "./validate-evidence-submission";

export { buildRequirementKey, type RequirementKeyParts } from "./requirement-key";

export {
  buildTemplatePresetDraft,
  isOperationalEvidencePresetKey,
  listTemplatePresetSummaries,
  OPERATIONAL_EVIDENCE_PRESET_KEYS,
  type OperationalEvidencePresetKey,
} from "./template-presets";

export {
  createDraft,
  createDraftFromPreset,
  loadBuilderTemplates,
  loadTemplateDetail,
  publishTemplate,
  retireTemplate,
  updateDraft,
  type EvidenceActor,
} from "./template-service";

export {
  resolveEvidenceRequirements,
  type AssetScopeForResolve,
  type ResolveEvidenceRequirementsInput,
  type SpaceScopeForResolve,
} from "./resolve-requirements";

export { submitEvidenceRecord } from "./submit-evidence";

export { correctEvidenceRecord } from "./correct-evidence";

export { loadEvidenceRecordDetail, searchEvidenceRecords } from "./log-book";

export {
  loadPublishedTemplatesForResolve,
  loadEvidenceScopeForUnit,
  loadExistingEvidenceForDate,
  resolveUnitEvidenceRequirements,
} from "./load-runtime-evidence";
