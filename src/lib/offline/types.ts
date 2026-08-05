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
