/**
 * Phase 9C Dietary Operational Evidence — compatibility library.
 *
 * Forward Records are CatalogLogDefinition → FacilityCatalogInstall → LogAttachment
 * → derived requirement → OperationalEvidenceRecord. OperationalTemplate is the
 * previous facility-owned definition engine, not the next layer after Catalog.
 * Writers and template-backed submitEvidenceRecord are fenced when
 * CANONICAL_LOGS_ENABLED is on. Historical rows stay readable.
 * OPERATION_ENGINE_ENABLED stays false.
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
  DIETARY_EVIDENCE_PRESET_KEYS,
  PLANT_RECORD_PRESET_KEYS,
  type OperationalEvidencePresetKey,
  type PlantRecordPresetKey,
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
