/**
 * Phase 6A Offline Runtime Foundation — shared contracts.
 *
 * Local state is never authoritative. Every synchronized command is revalidated
 * by the server using current session, sessionVersion, device, unit, and role.
 */

export const OFFLINE_STORE_VERSION = 1 as const;

export const OFFLINE_COMMAND_TYPES = [
  "RECORD_SERVERY_READY",
  "RECORD_MEAL_SERVICE_STARTED",
  "SUBMIT_OPERATIONAL_EVIDENCE",
  "REPORT_ASSET_ISSUE",
  "COMPLETE_OPERATIONAL_TASK",
] as const;

export type OfflineCommandType = (typeof OFFLINE_COMMAND_TYPES)[number];

export const OFFLINE_QUEUE_STATES = [
  "PENDING",
  "SYNCHRONIZING",
  "ACCEPTED",
  "ALREADY_ACCEPTED",
  "RETRY_REQUIRED",
  "REJECTED",
  "CONFLICT_REVIEW_REQUIRED",
] as const;

export type OfflineQueueState = (typeof OFFLINE_QUEUE_STATES)[number];

export const OFFLINE_SYNC_RESULTS = [
  "ACCEPTED",
  "ALREADY_ACCEPTED",
  "REJECTED",
  "CONFLICT_REVIEW_REQUIRED",
  "RETRY_REQUIRED",
] as const;

export type OfflineSyncResultCategory = (typeof OFFLINE_SYNC_RESULTS)[number];

export const OFFLINE_CONFLICT_CATEGORIES = [
  "DUPLICATE_DIFFERENT_COMMAND",
  "AUTHORITATIVE_STATE_CHANGED",
  "AUTHORITY_CHANGED",
  "DEVICE_CONTEXT_CHANGED",
  "MEAL_CONTEXT_CHANGED",
  "UNIT_CONTEXT_CHANGED",
  "UNSUPPORTED_OR_INVALID_COMMAND",
] as const;

export type OfflineConflictCategory = (typeof OFFLINE_CONFLICT_CATEGORIES)[number];

export type OfflineConnectivityState =
  | "ONLINE"
  | "OFFLINE"
  | "SYNCHRONIZING"
  | "SYNCHRONIZED"
  | "UNABLE_TO_SYNC"
  | "CONFLICT_REVIEW_REQUIRED"
  | "REAUTHENTICATION_REQUIRED"
  | "NO_BUNDLE";

export type OfflineMilestoneUiState =
  | "NOT_CONFIRMED"
  | "SAVED_ON_THIS_TABLET"
  | "SYNCHRONIZING"
  | "CONFIRMED"
  | "CONFIRMED_LATE"
  | "CORRECTED"
  | "REVIEW_REQUIRED";

/** Scoped Runtime bundle — intentionally minimal. Never includes JWTs, cookies, or credentials. */
export type OfflineRuntimeBundle = {
  bundleVersion: string;
  serverRevision: string;
  issuedAt: string;
  offlineAuthorizedUntil: string;
  lastSuccessfulSyncAt: string | null;
  facilityId: string;
  facilityTimezone: string;
  facilityName: string;
  departmentId: string;
  departmentName: string;
  unitId: string;
  unitName: string;
  deviceFacilityId: string;
  deviceBoundUnitId: string | null;
  actor: {
    displayName: string;
    role: string;
    authMethod: "PASSWORD" | "QUICK_PIN";
    authKind: "user" | "employee";
    /** Opaque identity reference for attribution — not a session token. */
    actorRef: string;
    sessionVersion: number;
  };
  operationalDate: string;
  mealContext: {
    applicableMealType: "BREAKFAST" | "LUNCH" | "DINNER" | null;
    label: string | null;
    expectedServiceTime: string | null;
  };
  milestones: {
    mealType: "BREAKFAST" | "LUNCH" | "DINNER";
    ready: OfflineMilestoneProjection;
    started: OfflineMilestoneProjection;
  }[];
  procedureLabels: string[];
  /**
   * Read-only confirmed Assignment for the current actor only.
   * Never includes other Employees. Editing remains online-only.
   */
  assignmentContext?: {
    assignmentId: string;
    unitId: string | null;
    unitName: string | null;
    duty: string;
    startsAt: string | null;
    endsAt: string | null;
    confirmedAt: string | null;
    lastSyncedAt: string;
    /** Phase 11C — UNIT or SPACES. */
    scopeKind?: "UNIT" | "SPACES";
    locationCount?: number;
    assignedLocations?: Array<{ unitSpaceId: string; label: string }>;
    sourceZoneName?: string | null;
    /** assignmentId + startsAt + locationCount for stale detection. */
    assignmentRevision?: string;
  } | null;
  /**
   * Read-only Operational Cycle context for the scoped unit/date.
   * Draft / department-wide Builder config is never included.
   */
  cycleContext?: {
    cycleId: string | null;
    label: string | null;
    cycleType: string | null;
    startLocal: string | null;
    endLocal: string | null;
    operationalDate: string;
    mealType: string | null;
    mealTargetTime: string | null;
    expectedMilestones: string[];
    nextCycleLabel: string | null;
    bundleRevision: string;
    lastSyncedAt: string;
  } | null;
  /**
   * Read-only Dietary Job Flow context derived from Assignment + Cycle.
   * No new command types. Never authoritative — refresh when online.
   */
  jobFlowContext?: {
    state: string;
    assignmentId: string | null;
    /** Assignment id + startsAt ISO as revision token. */
    assignmentRevision: string | null;
    unitId: string | null;
    unitName: string | null;
    duty: string | null;
    windowStart: string | null;
    windowEnd: string | null;
    cycleId: string | null;
    cycleLabel: string | null;
    cycleType: string | null;
    expectation: string | null;
    mealTargetTime: string | null;
    nextCycleLabel: string | null;
    expectedMilestones: string[];
    milestoneStates: { key: string; label: string }[];
    progressPhases: { key: string; label: string; status: string }[];
    attentionKinds: string[];
    evidenceRequirementKeys: string[];
    bundleRevision: string;
    lastSyncedAt: string;
    stale: boolean;
  } | null;
  /**
   * Scoped evidence forms for DUE/UPCOMING requirements only — never the full catalog.
   */
  evidenceContext?: {
    requirements: Array<{
      requirementKey: string;
      templateId: string;
      templateVersion: number;
      templateName: string;
      purposeType: string;
      state: string;
      scheduleKind: string;
      cycleStableKey: string | null;
      cycleLabel: string | null;
      windowStartLocal: string | null;
      windowEndLocal: string | null;
      assetId: string | null;
      spaceId: string | null;
      instructions: string | null;
      fields: Array<{
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
      }>;
    }>;
    lastSyncedAt: string;
  } | null;
  /**
   * Minimal unit-scoped Asset context for offline Issue reporting.
   * Never includes full catalog, Vendor details, or management notes.
   */
  assetContext?: {
    assets: Array<{
      id: string;
      name: string;
      assetCode: string;
      status: string;
      statusLabel: string;
      openIssueSummary: string | null;
    }>;
    lastSyncedAt: string;
  } | null;
  /**
   * Scoped Work requirements for DUE/CURRENT/UPCOMING only — never full catalog.
   * Unit rebind does not retarget occurrence keys in queued commands.
   */
  workContext?: {
    requirements: Array<{
      occurrenceKey: string;
      label: string;
      state: string;
      priority: string;
      completionMode: string;
      workPlanStableKey: string;
      workPlanVersion: number;
      workItemKey: string;
      workPlanId: string;
      workItemId: string;
      instructions: string | null;
      knowledgeArticleId: string | null;
      procedureTitle: string | null;
      dueAt: string | null;
      cycleStableKey: string | null;
      windowStartLocal: string | null;
      windowEndLocal: string | null;
      assignedEmployeeId: string | null;
    }>;
    lastSyncedAt: string;
  } | null;
};

export type OfflineMilestoneProjection = {
  eventId: string | null;
  occurredAt: string | null;
  recordedAt: string | null;
  recordedByLabel: string | null;
  corrected: boolean;
};

export type OfflineCommandEnvelope = {
  clientCommandId: string;
  commandType: OfflineCommandType;
  facilityId: string;
  departmentId: string;
  unitId: string;
  operationalDate: string;
  mealType: "BREAKFAST" | "LUNCH" | "DINNER";
  occurredAt: string;
  locallyRecordedAt: string;
  deviceBoundUnitId: string | null;
  actorRef: string;
  authMethod: "PASSWORD" | "QUICK_PIN";
  role: string;
  bundleVersion: string;
  expectedServerRevision: string;
  deviceTimezoneOffsetMinutes: number;
  /** Phase 9C evidence payload — present when commandType=SUBMIT_OPERATIONAL_EVIDENCE. */
  evidence?: {
    templateId: string;
    templateVersion: number;
    requirementKey: string;
    scheduleKind: string;
    cycleStableKey?: string | null;
    cycleLabel?: string | null;
    windowStartLocal?: string | null;
    windowEndLocal?: string | null;
    spaceId?: string | null;
    assetId?: string | null;
    correctiveActionText?: string | null;
    values: Array<{
      fieldKey: string;
      valueText?: string | null;
      valueNumber?: number | null;
      valueBoolean?: boolean | null;
      valueDateTime?: string | null;
      valueSelections?: string[];
    }>;
  };
  /** Phase 10A Asset Issue payload — present when commandType=REPORT_ASSET_ISSUE. */
  assetIssue?: {
    assetId: string;
    spaceId?: string | null;
    summary: string;
    description: string;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    operationalImpact?:
      | "NO_IMMEDIATE_IMPACT"
      | "WORKAROUND_AVAILABLE"
      | "SERVICE_AT_RISK"
      | "EQUIPMENT_UNAVAILABLE";
    equipmentRemainsUsable?: boolean;
    workaroundInstruction?: string | null;
    evidenceRecordId?: string | null;
    comment?: string | null;
    allowDuplicateOpen?: boolean;
  };
  /** Phase 11A Work completion payload — present when commandType=COMPLETE_OPERATIONAL_TASK. */
  workCompletion?: {
    occurrenceKey: string;
    workPlanId: string;
    workPlanStableKey: string;
    workPlanVersion: number;
    workItemId: string;
    workItemKey: string;
    label: string;
    instructions?: string | null;
    priority?: string;
    completionMode?: string;
    responsibilityMode?: string;
    scheduleKind?: string;
    cycleStableKey?: string | null;
    windowStartLocal?: string | null;
    windowEndLocal?: string | null;
    dueAt?: string | null;
    spaceId?: string | null;
    assetId?: string | null;
    knowledgeArticleId?: string | null;
    procedureTitle?: string | null;
    note?: string | null;
    evidenceRecordId?: string | null;
    /** Actor who queued — reassignment conflict if occurrence assigned elsewhere. */
    expectedAssignedEmployeeId?: string | null;
  };
};

export type OfflineQueuedCommand = OfflineCommandEnvelope & {
  queueState: OfflineQueueState;
  attemptCount: number;
  lastAttemptAt: string | null;
  retryAfterAt: string | null;
  lastErrorCategory: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OfflineSyncCommandResult = {
  clientCommandId: string;
  category: OfflineSyncResultCategory;
  reasonCode: string | null;
  authoritativeRecordId: string | null;
  serverAcceptedAt: string | null;
  serverRevision: string | null;
  retryAfterSeconds: number | null;
  conflictCategory: OfflineConflictCategory | null;
  authoritativeMilestone: OfflineMilestoneProjection | null;
};

export type OfflineSyncResponse = {
  results: OfflineSyncCommandResult[];
  bundle: OfflineRuntimeBundle | null;
  reauthenticationRequired: boolean;
  deviceRevoked: boolean;
};

export const OFFLINE_SYNC_MAX_BATCH = 20;
export const OFFLINE_BUNDLE_LEASE_HOURS = 12;
export const OFFLINE_ACCEPTED_RETENTION_HOURS = 72;
