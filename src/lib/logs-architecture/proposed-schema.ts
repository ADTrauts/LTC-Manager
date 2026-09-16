/**
 * Proposed Prisma shape for Logs Catalog + Attachment (documentation in types).
 * Phase 2 does NOT ship migration 83. Phase 3 decides when to materialize.
 *
 * Design choices:
 * - CatalogLogDefinition is platform-owned (no facilityId).
 * - LogAttachment is facility + department owned with its own stableKey.
 * - Discriminated target columns with exactly-one FK (Prisma-safe).
 * - OperationalEvidenceRecord gains optional attachmentId later (additive).
 */

export type ProposedCatalogLogDefinitionTable = {
  id: string;
  /** Always PLATFORM in V1 — no facilityId column. */
  ownerScope: "PLATFORM";
  stableKey: string;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  name: string;
  description: string | null;
  instructions: string | null;
  purposeType: "LOG" | "CHECKLIST";
  category: string;
  recommendedCadence: string | null;
  recommendedScheduleKind: string | null;
  recommendedDaypartLabels: string[];
  recommendedFixedWindowsJson: unknown;
  suggestionsJson: unknown;
  publishedAt: Date | null;
  retiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Unique: stableKey + version */
};

export type ProposedCatalogLogFieldTable = {
  id: string;
  definitionId: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  displaySequence: number;
  helpText: string | null;
  unitLabel: string | null;
  minNumber: number | null;
  maxNumber: number | null;
  allowedSelections: string[];
  correctiveActionTrigger: boolean;
  correctiveActionRequired: boolean;
};

export type ProposedLogAttachmentTable = {
  id: string;
  stableKey: string;
  facilityId: string;
  departmentId: string;
  catalogStableKey: string;
  catalogVersion: number;
  targetKind: "ASSET" | "SPACE" | "UNIT" | "DEPARTMENT" | "FACILITY";
  assetId: string | null;
  spaceId: string | null;
  unitId: string | null;
  /** Target department when targetKind=DEPARTMENT; may equal owning departmentId. */
  targetDepartmentId: string | null;
  status: "ACTIVE" | "INACTIVE" | "RETIRED";
  effectiveFrom: Date;
  effectiveTo: Date | null;
  timingSource: string;
  timingConfigJson: unknown;
  localDisplayLabel: string | null;
  localInstructions: string | null;
  needsSetup: boolean;
  needsSetupReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Additive columns proposed on OperationalEvidenceRecord (future migration):
 * - attachmentId String?
 * - attachmentStableKey String?
 * - catalogStableKey already mirrored via templateStableKey during transition
 * - expanded templateSnapshotJson → LogSubmissionSnapshot shape
 */
export type ProposedEvidenceRecordAttachmentColumns = {
  attachmentId: string | null;
  attachmentStableKey: string | null;
};

export const SCHEMA_CHANGE_RECOMMENDATION = {
  phase2Migration: null as null,
  migrationCountExpected: 83,
  phase3RequiresMigration83: false,
  phase3MigrationApplied: true,
  rationale:
    "Migration 83 adds platform CatalogLogDefinition + facility LogAttachment and Evidence Attachment linkage. Phase 2 contract types remain the product vocabulary.",
} as const;
