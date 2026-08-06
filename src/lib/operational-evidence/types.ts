/**
 * Phase 9C Operational Evidence — contracts.
 *
 * Requirements are derived for an operational date (not persisted).
 * Records are durable and carry templateSnapshotJson.
 */

import type {
  OperationalEvidenceFieldType,
  OperationalEvidenceRecordStatus,
  OperationalTemplateApplicabilityKind,
  OperationalTemplatePurposeType,
  OperationalTemplateScheduleKind,
  OperationalTemplateStatus,
  SpaceType,
} from "@prisma/client";

export type EvidenceRequirementState =
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

export type TemplateValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type TemplateValidationResult = {
  valid: boolean;
  errors: TemplateValidationIssue[];
  warnings: TemplateValidationIssue[];
};

export type TemplateFieldDraftInput = {
  fieldKey?: string;
  label: string;
  fieldType: OperationalEvidenceFieldType;
  isRequired?: boolean;
  displaySequence: number;
  helpText?: string | null;
  unitLabel?: string | null;
  minNumber?: number | null;
  maxNumber?: number | null;
  allowedSelections?: string[];
  correctiveActionTrigger?: boolean;
  correctiveActionRequired?: boolean;
};

export type TemplateApplicabilityDraftInput = {
  kind: OperationalTemplateApplicabilityKind;
  assetId?: string | null;
  assetType?: string | null;
  spaceId?: string | null;
  spaceType?: SpaceType | null;
  unitId?: string | null;
};

export type TemplateScheduleDraftInput = {
  kind: OperationalTemplateScheduleKind;
  cycleStableKey?: string | null;
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
};

export type TemplateDraftInput = {
  name: string;
  description?: string | null;
  instructions?: string | null;
  purposeType: OperationalTemplatePurposeType;
  allowAdHoc?: boolean;
  presetKey?: string | null;
  /** When set, creates a new version of an existing stableKey lineage. */
  stableKey?: string;
  fields: TemplateFieldDraftInput[];
  applicabilities?: TemplateApplicabilityDraftInput[];
  schedules?: TemplateScheduleDraftInput[];
};

export type TemplateFieldSnapshot = {
  fieldKey: string;
  label: string;
  fieldType: OperationalEvidenceFieldType;
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

export type TemplateSnapshotJson = {
  templateId: string;
  stableKey: string;
  version: number;
  name: string;
  description: string | null;
  instructions: string | null;
  purposeType: OperationalTemplatePurposeType;
  fields: TemplateFieldSnapshot[];
};

/** Published template shape accepted by the pure requirement resolver. */
export type PublishedTemplateForResolve = {
  id: string;
  stableKey: string;
  version: number;
  name: string;
  description: string | null;
  instructions: string | null;
  purposeType: OperationalTemplatePurposeType;
  status: OperationalTemplateStatus;
  allowAdHoc: boolean;
  fields: TemplateFieldSnapshot[];
  applicabilities: Array<{
    kind: OperationalTemplateApplicabilityKind;
    assetId: string | null;
    assetType: string | null;
    spaceId: string | null;
    spaceType: SpaceType | null;
    unitId: string | null;
  }>;
  schedules: Array<{
    kind: OperationalTemplateScheduleKind;
    cycleStableKey: string | null;
    windowStartLocal: string | null;
    windowEndLocal: string | null;
  }>;
};

export type PublishedCycleWindowForResolve = {
  stableKey: string;
  label: string;
  startLocal: string;
  endLocal: string;
  overnight: boolean;
  startsAt: Date;
  endsAt: Date;
};

export type ExistingEvidenceRecordForResolve = {
  id: string;
  requirementKey: string;
  status: OperationalEvidenceRecordStatus;
  templateStableKey: string;
  templateVersion: number;
};

export type EvidenceRequirement = {
  requirementKey: string;
  state: EvidenceRequirementState;
  stateLabel: string;
  operationalDateKey: string;
  templateId: string;
  templateStableKey: string;
  templateVersion: number;
  templateName: string;
  purposeType: OperationalTemplatePurposeType;
  scheduleKind: OperationalTemplateScheduleKind;
  cycleStableKey: string | null;
  cycleLabel: string | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  windowStartsAt: Date | null;
  windowEndsAt: Date | null;
  unitId: string | null;
  spaceId: string | null;
  assetId: string | null;
  assetType: string | null;
  spaceType: SpaceType | null;
  recordId: string | null;
  recordStatus: OperationalEvidenceRecordStatus | null;
  fields: TemplateFieldSnapshot[];
  instructions: string | null;
};

export type EvidenceFieldValueInput = {
  fieldKey: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueDateTime?: string | Date | null;
  valueSelections?: string[];
};

export type SubmitEvidenceInput = {
  facilityId: string;
  departmentId: string;
  templateId: string;
  requirementKey: string;
  operationalDateKey: string;
  scheduleKind: OperationalTemplateScheduleKind;
  cycleStableKey?: string | null;
  cycleLabel?: string | null;
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
  unitId?: string | null;
  spaceId?: string | null;
  assetId?: string | null;
  occurredAt: Date | string;
  recordedOnline?: boolean;
  clientCommandId?: string | null;
  deviceBoundUnitId?: string | null;
  recordedByEmployeeId?: string | null;
  recordedByLabel?: string | null;
  correctiveActionText?: string | null;
  values: EvidenceFieldValueInput[];
  /** When true, out-of-standard without required corrective → NEEDS_REVIEW. */
  allowNeedsReview?: boolean;
};

export type CorrectEvidenceInput = {
  facilityId: string;
  departmentId: string;
  recordId: string;
  reason: string;
  values: EvidenceFieldValueInput[];
  correctiveActionText?: string | null;
  correctedByEmployeeId?: string | null;
  correctedByLabel?: string | null;
};

export type EvidenceLogBookFilters = {
  facilityId: string;
  departmentId: string;
  dateFromKey?: string | null;
  dateToKey?: string | null;
  unitId?: string | null;
  assetId?: string | null;
  spaceId?: string | null;
  templateStableKey?: string | null;
  purposeType?: OperationalTemplatePurposeType | null;
  recordedByEmployeeId?: string | null;
  status?: OperationalEvidenceRecordStatus | null;
  correctiveOnly?: boolean;
  recordedOnline?: boolean | null;
  correctedOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export type EvidenceSubmissionValidationResult = {
  valid: boolean;
  errors: TemplateValidationIssue[];
  warnings: TemplateValidationIssue[];
  outOfStandard: boolean;
  correctiveActionRequired: boolean;
  fieldOutOfStandard: Record<string, boolean>;
};
