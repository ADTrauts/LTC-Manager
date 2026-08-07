/**
 * Phase 11A Department Work Plans — shared contracts.
 *
 * Work Requirements are derived for an operational date (not pre-generated).
 * Sparse DepartmentWorkOccurrence rows persist only when acted on.
 * Wave-era Task / Operations Engine remain isolated.
 */

import type {
  DepartmentWorkApplicabilityKind,
  DepartmentWorkCompletionMode,
  DepartmentWorkDueOffsetKind,
  DepartmentWorkItemPriority,
  DepartmentWorkOccurrenceSourceKind,
  DepartmentWorkOccurrenceStatus,
  DepartmentWorkPlanStatus,
  DepartmentWorkResponsibilityMode,
  DepartmentWorkScheduleKind,
  SpaceType,
} from "@prisma/client";

export type WorkRequirementState =
  | "UPCOMING"
  | "DUE"
  | "CURRENT"
  | "COMPLETED"
  | "COMPLETED_WITH_EVIDENCE"
  | "SAVED_ON_THIS_TABLET"
  | "SYNCHRONIZING"
  | "PAST_DUE_NOT_CONFIRMED"
  | "NOT_REQUIRED"
  | "REASSIGNED"
  | "CONFLICT_REVIEW"
  | "NOT_APPLICABLE"
  | "NOT_CONFIGURED";

export type WorkPlanApplicabilityDraftInput = {
  kind: DepartmentWorkApplicabilityKind;
  unitId?: string | null;
  spaceId?: string | null;
  spaceType?: SpaceType | null;
  assetId?: string | null;
  assetType?: string | null;
};

export type WorkItemDraftInput = {
  itemKey?: string;
  label: string;
  instructions?: string | null;
  displaySequence: number;
  priority?: DepartmentWorkItemPriority;
  completionMode?: DepartmentWorkCompletionMode;
  responsibilityMode?: DepartmentWorkResponsibilityMode;
  scheduleKind?: DepartmentWorkScheduleKind;
  cycleStableKeys?: string[];
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
  dueOffsetKind?: DepartmentWorkDueOffsetKind | null;
  dueOffsetMinutes?: number | null;
  roleKeys?: string[];
  unitId?: string | null;
  spaceId?: string | null;
  assetId?: string | null;
  knowledgeArticleId?: string | null;
  linkedTemplateStableKey?: string | null;
  linkedTemplateId?: string | null;
  supervisorVisible?: boolean;
};

export type WorkPlanDraftInput = {
  name: string;
  description?: string | null;
  presetKey?: string | null;
  stableKey?: string;
  effectiveStartDate?: string | null;
  effectiveEndDate?: string | null;
  weekdays?: number[];
  applicabilities?: WorkPlanApplicabilityDraftInput[];
  items: WorkItemDraftInput[];
};

export type WorkRequirement = {
  occurrenceKey: string;
  workPlanId: string;
  workPlanStableKey: string;
  workPlanVersion: number;
  workPlanName: string;
  workItemId: string;
  workItemKey: string;
  label: string;
  instructions: string | null;
  priority: DepartmentWorkItemPriority;
  completionMode: DepartmentWorkCompletionMode;
  responsibilityMode: DepartmentWorkResponsibilityMode;
  scheduleKind: DepartmentWorkScheduleKind;
  cycleStableKey: string | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  dueAt: Date | null;
  windowStartsAt: Date | null;
  windowEndsAt: Date | null;
  unitId: string | null;
  unitName: string | null;
  spaceId: string | null;
  assetId: string | null;
  roleKeys: string[];
  knowledgeArticleId: string | null;
  procedureTitle: string | null;
  linkedTemplateStableKey: string | null;
  linkedTemplateId: string | null;
  state: WorkRequirementState;
  occurrenceId: string | null;
  occurrenceStatus: DepartmentWorkOccurrenceStatus | null;
  assignedEmployeeId: string | null;
  completedByLabel: string | null;
  completedAt: Date | null;
  evidenceRecordId: string | null;
  sourceKind: DepartmentWorkOccurrenceSourceKind;
  sourceHref: string | null;
};

export type WorkPlanListItem = {
  id: string;
  stableKey: string;
  version: number;
  name: string;
  description: string | null;
  status: DepartmentWorkPlanStatus;
  itemCount: number;
  publishedAt: Date | null;
  retiredAt: Date | null;
  effectiveStartDate: Date | null;
  effectiveEndDate: Date | null;
};

export type OneOffWorkInput = {
  facilityId: string;
  departmentId: string;
  operationalDate: string;
  unitId: string;
  spaceId?: string | null;
  assetId?: string | null;
  title: string;
  instructions?: string | null;
  priority?: DepartmentWorkItemPriority;
  dueAt?: Date | null;
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
  assignedEmployeeId?: string | null;
  knowledgeArticleId?: string | null;
};

/** Published plan shape for pure requirement derivation (caller filters drafts/retired). */
export type PublishedWorkPlanForResolve = {
  id: string;
  stableKey: string;
  version: number;
  name: string;
  status: DepartmentWorkPlanStatus;
  effectiveStartDate: Date | null;
  effectiveEndDate: Date | null;
  weekdays: number[];
  applicabilities: Array<{
    kind: DepartmentWorkApplicabilityKind;
    unitId: string | null;
    spaceId: string | null;
    spaceType: SpaceType | null;
    assetId: string | null;
    assetType: string | null;
  }>;
  items: Array<{
    id: string;
    itemKey: string;
    label: string;
    instructions: string | null;
    displaySequence: number;
    priority: DepartmentWorkItemPriority;
    completionMode: DepartmentWorkCompletionMode;
    responsibilityMode: DepartmentWorkResponsibilityMode;
    scheduleKind: DepartmentWorkScheduleKind;
    cycleStableKeys: string[];
    windowStartLocal: string | null;
    windowEndLocal: string | null;
    dueOffsetKind: DepartmentWorkDueOffsetKind | null;
    dueOffsetMinutes: number | null;
    roleKeys: string[];
    unitId: string | null;
    spaceId: string | null;
    assetId: string | null;
    knowledgeArticleId: string | null;
    procedureTitleSnapshot: string | null;
    linkedTemplateStableKey: string | null;
    linkedTemplateId: string | null;
    supervisorVisible: boolean;
  }>;
};

export type PublishedCycleWindowForWorkResolve = {
  stableKey: string;
  label: string;
  startLocal: string;
  endLocal: string;
  startsAt: Date;
  endsAt: Date;
};

export type ExistingWorkOccurrenceForResolve = {
  id: string;
  occurrenceKey: string;
  status: DepartmentWorkOccurrenceStatus;
  assignedEmployeeId: string | null;
  completedByLabel: string | null;
  completedAt: Date | null;
  evidenceRecordId: string | null;
  sourceKind: DepartmentWorkOccurrenceSourceKind;
  workItemLabelSnapshot: string;
  instructionsSnapshot: string | null;
  priority: DepartmentWorkItemPriority;
  unitId: string | null;
  spaceId: string | null;
  assetId: string | null;
  dueAt: Date | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  cycleStableKey: string | null;
  knowledgeArticleId: string | null;
  procedureTitleSnapshot: string | null;
  workPlanId: string | null;
  workPlanStableKey: string | null;
  workPlanVersion: number | null;
  workItemId: string | null;
  workItemKey: string | null;
};

export type ConfirmedAssignmentForWorkResolve = {
  employeeId: string;
  unitId: string | null;
  roleKey: string | null;
};

export type AcceptedEvidenceForWorkResolve = {
  id: string;
  templateStableKey: string | null;
  templateId: string | null;
  unitId: string | null;
  status: string;
};
