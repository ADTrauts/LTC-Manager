/**
 * Display shape for the frontline shell.
 * Generic Work no longer loads or persists these rows.
 */

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
  kind: string;
  unitId?: string | null;
  spaceId?: string | null;
  spaceType?: string | null;
  assetId?: string | null;
  assetType?: string | null;
  operationalTypeKey?: string | null;
};

export type WorkItemDraftInput = {
  itemKey?: string;
  label: string;
  instructions?: string | null;
  displaySequence: number;
  priority?: string;
  completionMode?: string;
  responsibilityMode?: string;
  scheduleKind?: string;
  cycleStableKeys?: string[];
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
  dueOffsetKind?: string | null;
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
  priority: string;
  completionMode: string;
  responsibilityMode: string;
  scheduleKind: string;
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
  occurrenceStatus: string | null;
  assignedEmployeeId: string | null;
  completedByLabel: string | null;
  completedAt: Date | null;
  evidenceRecordId: string | null;
  sourceKind: string;
  sourceHref: string | null;
};

export type WorkPlanListItem = {
  id: string;
  stableKey: string;
  version: number;
  name: string;
  description: string | null;
  status: string;
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
  priority?: string;
  dueAt?: Date | null;
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
  assignedEmployeeId?: string | null;
  knowledgeArticleId?: string | null;
};

export type PublishedWorkPlanForResolve = {
  id: string;
  stableKey: string;
  version: number;
  name: string;
  status: string;
  effectiveStartDate: Date | null;
  effectiveEndDate: Date | null;
  weekdays: number[];
  items: unknown[];
  applicabilities: unknown[];
};

export type AcceptedEvidenceForWorkResolve = {
  id: string;
};

export type ConfirmedAssignmentForWorkResolve = {
  id: string;
};

export type ExistingWorkOccurrenceForResolve = {
  occurrenceKey: string;
};

export type PublishedCycleWindowForWorkResolve = {
  stableKey: string;
};

export type WorkAuthorityDecision = {
  canViewRuntime: boolean;
  canComplete: boolean;
  canViewDepartment: boolean;
  canCreateOneOff: boolean;
  canReassign: boolean;
  canMarkNotRequired: boolean;
  canReopen: boolean;
  canManage: boolean;
  canPublish: boolean;
  reason: string | null;
};

export type SpaceWorkSummaryState = "NONE";
