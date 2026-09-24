/**
 * Logs Phase 2 architecture contract — Catalog → Attachment → Requirement → Submission.
 */

export type {
  CatalogOwnerScope,
  CatalogLogStatus,
  CatalogLogPurposeType,
  CatalogLogCategory,
  CatalogRecommendedCadence,
  CatalogSuggestionMetadata,
  CatalogLogFieldDefinition,
  CatalogLogDefinition,
  LogAttachmentTargetKind,
  LogAttachmentTarget,
  LogAttachmentTimingSource,
  LogAttachmentDailyWindow,
  LogAttachmentCalendarRule,
  LogAttachmentTimingConfig,
  LogAttachmentLifecycleStatus,
  LogAttachment,
  LogRequirementProductState,
  LegacyEvidenceRequirementState,
  LogRequirement,
  LogSubmissionSnapshot,
  CanonicalLogSubmissionStore,
  LegacyLogTemplateMappingClass,
  LegacyCutoverPhase,
  LogsDomainBoundary,
} from "./types";

export {
  productStateLabel,
  mapEvidenceStateToProductState,
  deriveWindowProductState,
} from "./due-state";

export {
  historySlotStateLabel,
  toHistorySlotState,
  type LogHistorySlotState,
} from "./history-slot-state";

export {
  DEFAULT_DAYPART_WINDOWS,
  daypartWindowsForCadence,
  resolveDefaultAttachmentTiming,
  evaluateAttachmentNeedsSetup,
  isValidTimingSource,
} from "./timing";

export {
  parseRecommendedWeekdays,
  type ParsedRecommendedWeekdays,
} from "./recommended-weekdays";

export {
  dispositionForApplicabilityKind,
  targetKindFromApplicability,
  attachmentTimingFingerprint,
  targetIdentityKey,
  wouldDuplicateActiveAttachment,
  isFloorAllowedAsLogTarget,
  isFacilityTargetDeferredForV1,
  type ApplicabilityDisposition,
} from "./attachment-rules";

export {
  buildLogRequirementKey,
  isAttachmentBackedRequirementKey,
  type LogRequirementKeyParts,
} from "./requirement-key";

export {
  LOGS_DOMAIN_BOUNDARY,
  LEGACY_CUTOVER_PHASES,
  classifyLegacyLogTemplate,
  hintLegacyAssignmentMapping,
  ROUTE_ROLES,
  type LegacyTemplateMappingStrategy,
  type LegacyAssignmentMappingHint,
} from "./compatibility";

export {
  SCHEMA_CHANGE_RECOMMENDATION,
  type ProposedCatalogLogDefinitionTable,
  type ProposedCatalogLogFieldTable,
  type ProposedLogAttachmentTable,
  type ProposedEvidenceRecordAttachmentColumns,
} from "./proposed-schema";
