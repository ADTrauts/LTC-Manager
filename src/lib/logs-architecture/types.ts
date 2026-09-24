/**
 * Logs Phase 2 — canonical architecture contract (types only).
 *
 * Product model:
 *   LTC Corp Catalog → Facility Log Attachment → Derived LogRequirement → Log Submission
 *
 * Persistence foundation for new canonical RUN submissions:
 *   OperationalEvidenceRecord (+ field values + corrections)
 *
 * This module is implementation-ready design. It does not wire production behavior
 * and does not require a schema migration by itself.
 */

import type {
  OperationalEvidenceFieldType,
  OperationalEvidenceRecordStatus,
  OperationalTemplatePurposeType,
  OperationalTemplateScheduleKind,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/** Platform/LTC Corp owns Catalog definitions — never a Facility. */
export type CatalogOwnerScope = "PLATFORM";

export type CatalogLogStatus = "DRAFT" | "PUBLISHED" | "RETIRED";

/**
 * Product umbrella for Catalog entries that produce Log Submissions.
 * Work Engine InspectionDefinition remains a separate domain.
 */
export type CatalogLogPurposeType = Extract<
  OperationalTemplatePurposeType,
  "LOG" | "CHECKLIST"
>;

export type CatalogLogCategory =
  | "TEMPERATURE"
  | "SANITATION"
  | "CLEANING"
  | "EQUIPMENT"
  | "FOOD_SAFETY"
  | "OPENING_CLOSING"
  | "COMPLIANCE"
  | "OTHER";

/**
 * Recommended cadence guidance on the Catalog — not facility clock truth.
 * Attachment timing resolves this into concrete windows/cycles/calendar rules.
 */
export type CatalogRecommendedCadence =
  | "ONCE_DAILY"
  | "TWICE_DAILY"
  | "THREE_TIMES_DAILY"
  | "ONCE_PER_OPERATIONAL_CYCLE"
  | "WEEKLY"
  | "MONTHLY"
  | "AD_HOC";

/** Discovery / bulk-selection hints — never silent operational attachment. */
export type CatalogSuggestionMetadata = {
  assetTypes: string[];
  spaceTypes: string[];
  departmentKeys: string[];
  keywords: string[];
};

export type CatalogLogFieldDefinition = {
  fieldKey: string;
  label: string;
  fieldType: OperationalEvidenceFieldType;
  isRequired: boolean;
  displaySequence: number;
  helpText: string | null;
  /** Free-text unit (e.g. °F, ppm). No universal unit framework in V1. */
  unitLabel: string | null;
  minNumber: number | null;
  maxNumber: number | null;
  allowedSelections: string[];
  correctiveActionTrigger: boolean;
  correctiveActionRequired: boolean;
};

/**
 * Logical Catalog Log across versions.
 * stableKey is the immutable lineage identity (Phase 9C pattern).
 */
export type CatalogLogDefinition = {
  /** Row id for a specific version. */
  id: string;
  ownerScope: CatalogOwnerScope;
  /** Lineage identity across versions. */
  stableKey: string;
  version: number;
  status: CatalogLogStatus;
  name: string;
  description: string | null;
  instructions: string | null;
  purposeType: CatalogLogPurposeType;
  category: CatalogLogCategory;
  recommendedCadence: CatalogRecommendedCadence | null;
  fields: CatalogLogFieldDefinition[];
  /**
   * Suggested default timing shape for Attachments.
   * Must not encode a specific facility's cycle keys or asset IDs.
   */
  recommendedScheduleKind: OperationalTemplateScheduleKind | null;
  /**
   * Optional named daypart labels when cadence is daily windows
   * (e.g. Morning / Afternoon). Exact clocks live on Attachment unless Catalog
   * explicitly defines fixed HH:mm windows.
   */
  recommendedDaypartLabels: string[];
  /** Optional fixed HH:mm pairs when Catalog truly requires clock precision. */
  recommendedFixedWindows: Array<{ startLocal: string; endLocal: string }>;
  suggestions: CatalogSuggestionMetadata;
  publishedAt: string | null;
  retiredAt: string | null;
};

// ---------------------------------------------------------------------------
// Attachment
// ---------------------------------------------------------------------------

export type LogAttachmentTargetKind =
  | "ASSET"
  | "SPACE"
  | "UNIT"
  | "DEPARTMENT"
  | "FACILITY"
  | "OPERATIONAL_TYPE";

/**
 * Discriminated target columns — Prisma-safe FK style (preferred).
 * Exactly one target id is set for the kind.
 * Floor is intentionally omitted as a canonical target.
 */
export type LogAttachmentTarget =
  | { kind: "ASSET"; assetId: string; spaceId?: null; unitId?: null; departmentId?: null }
  | { kind: "SPACE"; spaceId: string; assetId?: null; unitId?: null; departmentId?: null }
  | { kind: "UNIT"; unitId: string; assetId?: null; spaceId?: null; departmentId?: null }
  | { kind: "DEPARTMENT"; departmentId: string; assetId?: null; spaceId?: null; unitId?: null }
  | {
      kind: "FACILITY";
      /** Facility is implied by Attachment.facilityId; no extra target id. */
      assetId?: null;
      spaceId?: null;
      unitId?: null;
      departmentId?: null;
    }
  | {
      kind: "OPERATIONAL_TYPE";
      /** Stable DepartmentRoomArchetype.key. Never a display name. */
      operationalTypeKey: string;
      /**
       * Set only when an OT attachment is expanded onto a concrete room for
       * due-state. The stored Attachment row does not copy onto the room.
       */
      resolvedSpaceId?: string | null;
      assetId?: null;
      spaceId?: null;
      unitId?: null;
      departmentId?: null;
    };

export type LogAttachmentTimingSource =
  | "CATALOG_DEFAULT"
  | "DAILY_WINDOWS"
  | "OPERATIONAL_CYCLE"
  | "CALENDAR"
  | "AD_HOC";

export type LogAttachmentDailyWindow = {
  /** Display label (Morning / Afternoon / Evening / custom). */
  label: string;
  startLocal: string;
  endLocal: string;
};

export type LogAttachmentCalendarRule = {
  /** Reuses Inspection cadence concepts without coupling domains. */
  cadenceType: "DAILY" | "WEEKLY" | "MONTHLY";
  daysOfWeek: number[];
  dayOfMonth: number | null;
  /** Optional due wall time when calendar schedule is truly clock-precise. */
  dueTimeLocal: string | null;
};

export type LogAttachmentTimingConfig = {
  source: LogAttachmentTimingSource;
  /** Selected published Department cycle stable keys when source = OPERATIONAL_CYCLE. */
  cycleStableKeys: string[];
  dailyWindows: LogAttachmentDailyWindow[];
  calendar: LogAttachmentCalendarRule | null;
  allowAdHoc: boolean;
};

export type LogAttachmentLifecycleStatus = "ACTIVE" | "INACTIVE" | "RETIRED";

/**
 * Facility-owned operational binding of a Catalog Log to a target.
 * Has its own identity — not CatalogId+target composite.
 */
export type LogAttachment = {
  id: string;
  /** Stable identity across prospective config revisions (V1). */
  stableKey: string;
  facilityId: string;
  /** Owning/responsible Department for runtime scoping. */
  departmentId: string;
  catalogStableKey: string;
  /** Published Catalog version pinned at attach / last Catalog upgrade. */
  catalogVersion: number;
  target: LogAttachmentTarget;
  status: LogAttachmentLifecycleStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  timing: LogAttachmentTimingConfig;
  localDisplayLabel: string | null;
  localInstructions: string | null;
  /**
   * True when Attachment cannot safely produce RUN requirements
   * (e.g. missing published cycles for selected stable keys).
   */
  needsSetup: boolean;
  needsSetupReason: string | null;
};

// ---------------------------------------------------------------------------
// Derived requirement + product due states
// ---------------------------------------------------------------------------

/** Staff-facing primary states. */
export type LogRequirementProductState =
  | "UPCOMING"
  | "DUE"
  | "OVERDUE"
  | "COMPLETED"
  | "COMPLETED_WITH_EXCEPTION"
  | "NEEDS_SETUP"
  | "NOT_APPLICABLE";

/**
 * Internal Phase 9C states that may still appear in resolvers.
 * Product mapping lives in due-state helpers.
 */
export type LegacyEvidenceRequirementState =
  | "UPCOMING"
  | "DUE"
  | "COMPLETED"
  | "COMPLETED_WITH_CORRECTIVE_ACTION"
  | "NEEDS_REVIEW"
  | "NOT_CONFIRMED"
  | "NOT_APPLICABLE"
  | "NOT_CONFIGURED"
  | "SAVED_ON_THIS_TABLET"
  | "SYNCHRONIZING"
  | "CONFLICT_REVIEW";

/**
 * Derived read-model for one expected Log instance on a service date.
 * Not persisted unless a future phase proves necessity.
 */
export type LogRequirement = {
  requirementKey: string;
  attachmentId: string;
  attachmentStableKey: string;
  catalogStableKey: string;
  catalogVersion: number;
  catalogName: string;
  purposeType: CatalogLogPurposeType;
  facilityId: string;
  departmentId: string;
  operationalDateKey: string;
  timingSource: LogAttachmentTimingSource;
  scheduleKind: OperationalTemplateScheduleKind;
  cycleStableKey: string | null;
  cycleLabel: string | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  windowStartsAt: Date | null;
  windowEndsAt: Date | null;
  target: LogAttachmentTarget;
  productState: LogRequirementProductState;
  productStateLabel: string;
  /** Supervisor-facing secondary flag; staff still see Completed with exception. */
  needsSupervisorReview: boolean;
  recordId: string | null;
  recordStatus: OperationalEvidenceRecordStatus | null;
  fields: CatalogLogFieldDefinition[];
  instructions: string | null;
};

// ---------------------------------------------------------------------------
// Submission snapshot (product contract over OperationalEvidenceRecord)
// ---------------------------------------------------------------------------

export type LogSubmissionSnapshot = {
  catalogId: string;
  catalogStableKey: string;
  catalogVersion: number;
  catalogName: string;
  purposeType: CatalogLogPurposeType;
  attachmentId: string;
  attachmentStableKey: string;
  attachmentConfig: {
    timing: LogAttachmentTimingConfig;
    localDisplayLabel: string | null;
    localInstructions: string | null;
    target: LogAttachmentTarget;
  };
  fields: CatalogLogFieldDefinition[];
  instructions: string | null;
};

/** Product name for OperationalEvidenceRecord when purpose is LOG/CHECKLIST. */
export type CanonicalLogSubmissionStore = "OperationalEvidenceRecord";

// ---------------------------------------------------------------------------
// Compatibility / cutover
// ---------------------------------------------------------------------------

export type LegacyLogTemplateMappingClass =
  | "MATCHES_CATALOG"
  | "FACILITY_CUSTOM"
  | "OBSOLETE_DUPLICATE";

export type LegacyCutoverPhase = "A_COEXIST" | "B_NEW_EVIDENCE_ONLY" | "C_LEGACY_READ_ONLY" | "D_HISTORY_PRESERVED";

export type LogsDomainBoundary = {
  logsUmbrellaIncludes: CatalogLogPurposeType[];
  inspectionsRemainSeparate: true;
  mealPeriodIsNotTimingAuthority: true;
  typeApplicabilityIsSuggestionOnly: true;
  canonicalRunStore: CanonicalLogSubmissionStore;
};
