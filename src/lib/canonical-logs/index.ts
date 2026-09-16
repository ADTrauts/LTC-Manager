/**
 * Canonical Logs foundation (Phase 3).
 * Catalog (platform) → Attachment (facility) → LogRequirement (derived) → Evidence submission.
 */

export { isCanonicalLogsEnabled } from "@/lib/feature-flags";

export {
  publishCatalogDefinition,
  retireCatalogDefinition,
  createCatalogDraftSuccessor,
  loadPublishedCatalogByStableKey,
  loadCatalogDefinitionById,
  assertCatalogPublishedImmutable,
  type CatalogActor,
} from "./catalog-service";

export {
  CATALOG_SEED_DEFINITIONS,
  upsertPublishedCatalogSeeds,
} from "./catalog-seed";

export {
  createLogAttachment,
  setLogAttachmentStatus,
  updateLogAttachment,
  loadLogAttachmentForFacility,
  type CreateLogAttachmentInput,
  type UpdateLogAttachmentInput,
} from "./attachment-service";

export {
  listPublishedCatalogBrowseCards,
  loadPublishedCatalogDetail,
  filterCatalogCards,
  catalogCategoryLabel,
  catalogPurposeLabel,
  type CatalogBrowseCard,
  type CatalogDetailView,
} from "./catalog-browse";

export {
  parseCatalogSuggestions,
  catalogMatchesTarget,
  rankCatalogBySuggestion,
  type SuggestionTargetContext,
} from "./suggestions";

export {
  formatTimingSummary,
  formatLocalTime12h,
  catalogCadenceLabel,
  scheduleSourceLabel,
} from "./timing-display";

export { resolveDefaultAttachmentEffectiveFromKey } from "./effective-from";

export {
  presentLogAttachment,
  listAttachmentsForTarget,
  listFacilityAttachments,
  type AttachmentListItem,
} from "./attachment-presentation";

export { resolveAttachmentTargetLabel } from "./target-labels";

export {
  loadCycleOptionsForDepartment,
  cycleLabelMap,
  type CycleOptionForLogs,
} from "./cycle-options";

export { resolveAttachTimingProposal } from "./attach-timing";

export {
  loadFacilityRunLogRequirements,
  loadRunLogRequirementByKey,
} from "./load-run-requirements";

export {
  presentRunLogRequirement,
  groupRunLogRequirements,
  formatRunTimingContext,
  type RunLogRequirementView,
} from "./run-presentation";

export { loadRunLogRecordView } from "./load-run-log-record";

export {
  validateAttachmentTarget,
  timingFingerprintFromAttachment,
  type AttachmentTargetInput,
} from "./attachment-validate";

export {
  resolveLogRequirementsForAttachment,
  type PublishedCycleForLogs,
  type ExistingLogEvidenceForResolve,
} from "./resolve-log-requirements";

export {
  buildCanonicalLogSubmissionSnapshot,
  type LogSubmissionSnapshotV2,
} from "./snapshot";

export {
  submitCanonicalLogSubmission,
  type SubmitCanonicalLogInput,
} from "./submit-canonical-log";

export { mapTimingModeToScheduleKind } from "./schedule-kind";
