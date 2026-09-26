/**
 * Canonical Logs foundation (Phase 3).
 * Catalog (platform) → Facility install → Attachment (place) → LogRequirement (derived) → Evidence.
 */

export { isCanonicalLogsEnabled } from "@/lib/feature-flags";

export {
  publishCatalogDefinition,
  retireCatalogDefinition,
  createCatalogDraftSuccessor,
  createCatalogDefinition,
  updateCatalogDraft,
  deleteCatalogDraft,
  loadPublishedCatalogByStableKey,
  loadCatalogDefinitionById,
  assertCatalogPublishedImmutable,
  slugCatalogToken,
  HARBOR_CATALOG_WRITE,
  type CatalogActor,
  type CatalogDefinitionInput,
  type CatalogFieldInput,
  type CatalogWriteOptions,
} from "./catalog-service";

export {
  CATALOG_SEED_DEFINITIONS,
  upsertPublishedCatalogSeeds,
} from "./catalog-seed";

export {
  createLogAttachment,
  setLogAttachmentStatus,
  updateLogAttachment,
  adoptLogAttachmentCatalogVersion,
  loadLogAttachmentForFacility,
  type CreateLogAttachmentInput,
  type UpdateLogAttachmentInput,
} from "./attachment-service";

export {
  filterCatalogCardsToInstalled,
  listInstalledCatalogStableKeys,
  isCatalogInstalled,
  listFacilityCatalogInstallCounts,
  ensureFacilityCatalogInstall,
  installPublishedCatalog,
  type FacilityCatalogInstallRow,
} from "./facility-catalog-install";

export {
  classifyAttachmentUpdate,
  attachmentLineageKey,
  attachmentHasBecomeEffective,
  DISPLAY_ONLY_ATTACHMENT_FIELDS,
} from "./attachment-update-policy";

export {
  groupLogicalLogAttachments,
  logicalAttachmentsForBuildList,
  type LogicalLogAttachmentProjection,
} from "./logical-attachment";

export { loadAssetRunLogs } from "./load-asset-run-logs";
export {
  loadTargetRunLogs,
  targetRunAttachmentWhere,
  targetRunBuildHref,
} from "./load-target-run-logs";
export {
  presentHistoryTable,
  accessibleHistoryCellLabel,
} from "./history-presentation";

export {
  listPublishedCatalogBrowseCards,
  loadPublishedCatalogDetail,
  filterCatalogCards,
  catalogCategoryLabel,
  catalogPurposeLabel,
  catalogBrowseFilterGroupLabel,
  categoryMatchesBrowseGroup,
  type CatalogBrowseCard,
  type CatalogDetailView,
  type CatalogBrowseFilterGroup,
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
  catalogRecommendedScheduleLabel,
  scheduleSourceLabel,
} from "./timing-display";

export { resolveDefaultAttachmentEffectiveFromKey, describeAttachmentStart } from "./effective-from";

export {
  presentLogAttachment,
  listAttachmentsForTarget,
  listFacilityAttachments,
  attachmentTargetBuildHref,
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
  loadCatalogAssignView,
  applyCatalogAssignSelection,
  computeCatalogAssignDiff,
  includeUnitInCatalogAssign,
  targetAssignKey,
  parseTargetAssignKey,
  CATALOG_UNASSIGN_NOTICE,
  type CatalogAssignView,
  type CatalogAssignKind,
  type CatalogAssignTargetRow,
} from "./catalog-assign";

export {
  loadFacilityRunLogRequirements,
  loadRunLogRequirementByKey,
} from "./load-run-requirements";

export {
  presentRunLogRequirement,
  groupRunLogRequirements,
  formatRunTimingContext,
  type RunLogRequirementView,
  type UpcomingRunLogView,
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
  type LogAttachmentForResolve,
} from "./resolve-log-requirements";

export {
  matchLogAttachmentToLocation,
  dedupeLocationLogMatches,
  dedupeLocationLogRequirements,
  bindOperationalTypeRequirementToSpace,
  expandOperationalTypeSpaces,
  operationalTypeAssignId,
  type LocationLogApplicabilitySource,
} from "./log-operational-type-applicability";

export {
  projectLogExpectationHistory,
  enumerateServiceDateKeys,
  selectSegmentForDate,
  segmentCoversDate,
  type LogExpectationHistorySegment,
  type LogExpectationHistoryDay,
  type LogExpectationHistorySlot,
  type LogHistorySubmission,
} from "./expectation-history";

export {
  buildCanonicalLogSubmissionSnapshot,
  type LogSubmissionSnapshotV2,
} from "./snapshot";

export {
  submitCanonicalLogSubmission,
  type SubmitCanonicalLogInput,
} from "./submit-canonical-log";

export { mapTimingModeToScheduleKind } from "./schedule-kind";
