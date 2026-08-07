/**
 * Phase 9B Dietary Employee Job Flow — derived Runtime projection contracts.
 *
 * Ownership (locked):
 * - Job Flow does NOT own Assignment, Cycle, MealTime, Milestone, Coverage, or Offline.
 * - No JobFlowRecord / no migration. Facts are recomputed from authoritative sources.
 * - No Employee acknowledgment persistence in Phase 9B (revision indicator + refresh).
 * - Never use "Blocked" or "failed" for missing evidence — Not Confirmed is neutral.
 */

import type { MealType, OperationalCycleType, ServeryMilestone } from "@prisma/client";

import type { CycleMilestoneStatusKey } from "@/lib/operational-cycles/milestone-cycle-status";
import type { OfflineConnectivityState, OfflineMilestoneUiState } from "@/lib/offline/types";
import type { EvidenceRequirement } from "@/lib/operational-evidence/types";
import type { WorkRequirement } from "@/lib/department-work/types";

/** Due Soon window: 45 minutes before cycle start. */
export const DUE_SOON_MS = 45 * 60 * 1000;

export type JobFlowState =
  | "READY"
  | "NO_CONFIRMED_ASSIGNMENT"
  | "BEFORE_ASSIGNMENT"
  | "BETWEEN_ASSIGNMENTS"
  | "ACTIVE"
  | "ASSIGNMENT_COMPLETE"
  | "DAY_COMPLETE"
  | "NOT_CONFIGURED"
  | "NOT_APPLICABLE"
  | "REAUTHENTICATION_REQUIRED"
  | "OFFLINE_STALE";

export type JobFlowPhaseStatus =
  | "Upcoming"
  | "Current"
  | "Confirmed"
  | "SavedOnThisTablet"
  | "Synchronizing"
  | "ReviewRequired"
  | "NotConfirmed";

export type JobFlowAttentionKind =
  | "assignment_not_confirmed"
  | "assignment_updated"
  | "milestone_late"
  | "milestone_not_confirmed"
  | "pending_sync"
  | "conflict_review"
  | "missing_config"
  | "stale"
  | "evidence_due"
  | "evidence_corrective"
  | "evidence_review"
  | "work_due"
  | "work_past_due"
  | "work_conflict";

export type JobFlowAssignmentSnapshot = {
  id: string;
  roleKey: string;
  roleLabel: string;
  unitId: string | null;
  unitName: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  status: string;
  scopeKind?: "UNIT" | "SPACES";
  locationCount?: number;
  locationLabels?: string[];
  sourceZoneName?: string | null;
};

export type JobFlowScopeSummary = {
  title: string;
  detail: string;
};

export type JobFlowLocationSequenceItem = {
  unitSpaceId: string;
  label: string;
  hasCurrentWork: boolean;
  allComplete: boolean;
  hasUrgent: boolean;
};

export type JobFlowLocationSequence = {
  now: JobFlowLocationSequenceItem | null;
  next: JobFlowLocationSequenceItem | null;
  queue: JobFlowLocationSequenceItem[];
  all: JobFlowLocationSequenceItem[];
  sequencingNote: string;
};

export type JobFlowUnitSnapshot = {
  id: string;
  name: string;
};

export type JobFlowCycleSnapshot = {
  id: string;
  label: string;
  cycleType: OperationalCycleType;
  description: string | null;
  startLocal: string;
  endLocal: string;
  startsAt: Date;
  endsAt: Date;
  mealType: MealType | null;
  expectedMilestones: readonly ServeryMilestone[];
};

export type JobFlowMilestoneState = {
  key: CycleMilestoneStatusKey;
  label: string;
  readyUi?: OfflineMilestoneUiState | null;
  startedUi?: OfflineMilestoneUiState | null;
};

export type JobFlowSyncState = {
  connectivity: OfflineConnectivityState | null;
  pendingCount: number;
  conflictCount: number;
  lastSuccessfulSyncAt: string | null;
};

export type JobFlowCurrent = {
  assignment?: JobFlowAssignmentSnapshot | null;
  unit?: JobFlowUnitSnapshot | null;
  cycle?: JobFlowCycleSnapshot | null;
  expectation: string;
  targetTime?: string | null;
  milestoneState?: JobFlowMilestoneState | null;
  syncState?: JobFlowSyncState | null;
};

export type JobFlowNext = {
  cycle?: JobFlowCycleSnapshot | null;
  assignment?: JobFlowAssignmentSnapshot | null;
  milestoneExpectation?: string | null;
  minutesUntil?: number | null;
};

export type JobFlowProgressPhase = {
  id: string;
  label: string;
  kind: "cycle" | "milestone" | "assignment";
  status: JobFlowPhaseStatus;
  targetTime?: string | null;
};

export type JobFlowAttentionItem = {
  kind: JobFlowAttentionKind;
  message: string;
};

export type JobFlowBase = {
  operationalDateKey: string;
  facilityTimezone: string;
  current: JobFlowCurrent;
  next: JobFlowNext;
  progress: { phases: JobFlowProgressPhase[] };
  attention: JobFlowAttentionItem[];
  /** Derived evidence requirements for the current unit/date (Phase 9C). Empty when flag off. */
  evidenceRequirements: EvidenceRequirement[];
  /** Derived Work requirements for the current unit/date (Phase 11A). Empty when flag off. */
  workRequirements: WorkRequirement[];
  /** Compact space Work progress when requirements carry spaceIds (Phase 11B EVS). */
  spaceWorkSummaries: Array<{
    spaceId: string;
    state: string;
    completedCount: number;
    totalCount: number;
    label: string;
  }>;
  /** Phase 11C — assigned location scope summary for Employee Job Flow. */
  scopeSummary?: JobFlowScopeSummary | null;
  /** Phase 11C — deterministic NOW/NEXT/QUEUE (not route optimization). */
  locationSequence?: JobFlowLocationSequence | null;
};

/** Only assignment-bearing / cycle-bearing variants carry those fields. */
export type JobFlowContext =
  | (JobFlowBase & {
      state: "READY";
      assignment: JobFlowAssignmentSnapshot;
      cycle: JobFlowCycleSnapshot | null;
    })
  | (JobFlowBase & {
      state: "NO_CONFIRMED_ASSIGNMENT";
      cycle: JobFlowCycleSnapshot | null;
    })
  | (JobFlowBase & {
      state: "BEFORE_ASSIGNMENT";
      assignment: JobFlowAssignmentSnapshot;
      cycle: JobFlowCycleSnapshot | null;
    })
  | (JobFlowBase & {
      state: "BETWEEN_ASSIGNMENTS";
      previousAssignment: JobFlowAssignmentSnapshot;
      nextAssignment: JobFlowAssignmentSnapshot;
      cycle: JobFlowCycleSnapshot | null;
    })
  | (JobFlowBase & {
      state: "ACTIVE";
      assignment: JobFlowAssignmentSnapshot;
      cycle: JobFlowCycleSnapshot;
    })
  | (JobFlowBase & {
      state: "ASSIGNMENT_COMPLETE";
      assignment: JobFlowAssignmentSnapshot;
      cycle: JobFlowCycleSnapshot | null;
    })
  | (JobFlowBase & {
      state: "DAY_COMPLETE";
      lastCycle: JobFlowCycleSnapshot | null;
      lastAssignment: JobFlowAssignmentSnapshot | null;
    })
  | (JobFlowBase & {
      state: "NOT_CONFIGURED";
      reason: "NO_PUBLISHED_CYCLES" | "NONE_APPLICABLE";
    })
  | (JobFlowBase & { state: "NOT_APPLICABLE" })
  | (JobFlowBase & { state: "REAUTHENTICATION_REQUIRED" })
  | (JobFlowBase & { state: "OFFLINE_STALE" });

export type SupervisorExceptionGroup =
  | "Staffing"
  | "Coverage"
  | "Readiness"
  | "ServiceTiming"
  | "Evidence"
  | "Work"
  | "Asset"
  | "Equipment"
  | "OfflineSync"
  | "Configuration";

export type SupervisorExceptionTemporal =
  | "Upcoming"
  | "DueSoon"
  | "Current"
  | "Late"
  | "NotConfirmed"
  | "Confirmed";

export type SupervisorExceptionItem = {
  group: SupervisorExceptionGroup;
  status: string;
  temporal: SupervisorExceptionTemporal;
  unitId?: string | null;
  unitName?: string | null;
  /** Friendly Room/Space label for location coverage exceptions (Phase 11C). */
  locationLabel?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  cycleLabel?: string | null;
  time?: string | null;
  sourceHref: string;
  /** Navigation-only action labels — board does not mutate. */
  availableActions: string[];
  sortRank: number;
};

export type SupervisorBoardSummaryCounts = {
  scheduled: number;
  assigned: number;
  unassigned: number;
  callOffs: number;
  covered: number;
  atRisk: number;
  uncovered: number;
  readyConfirmed: number;
  readyNotConfirmed: number;
  started: number;
  startedLate: number;
  startedNotConfirmed: number;
  conflicts: number;
  /** Phase 11C EVS location coverage counts (null for Dietary). */
  locationCovered?: number | null;
  locationAtRisk?: number | null;
  locationUncovered?: number | null;
  locationOverlapping?: number | null;
  locationRequired?: number | null;
};

export type SupervisorBoardUnitRow = {
  unitId: string;
  unitName: string;
  unitType: string;
  cycleLabel: string | null;
  cycleState: string;
  mealTargetTime: string | null;
  milestoneLabel: string | null;
  coverageState: string | null;
  workspaceHref: string;
};

export type SupervisorLocationCoverageRow = {
  unitSpaceId: string;
  label: string;
  unitId: string | null;
  unitName: string | null;
  floorUnitId: string | null;
  floorName: string | null;
  state: string;
  employeeLabels: string[];
  zoneIds: string[];
};

export type SupervisorOperationsFilters = {
  floor: string | null;
  unit: string | null;
  zone: string | null;
  employee: string | null;
  floors: Array<{ id: string; name: string }>;
  units: Array<{ id: string; name: string }>;
  zones: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string }>;
};

export type SupervisorOperationsBoard = {
  header: {
    facilityId: string;
    facilityName: string;
    departmentId: string;
    departmentName: string;
    departmentKey: string;
    operationalDateKey: string;
    currentCycleLabel: string | null;
    nextCycleLabel: string | null;
    planStatus: string | null;
    lastUpdated: string;
  };
  summary: SupervisorBoardSummaryCounts;
  exceptions: SupervisorExceptionItem[];
  viewAllUnits: SupervisorBoardUnitRow[];
  /** Phase 11C — EVS location coverage projection (null when not EVS). */
  locationCoverage: {
    unassigned: SupervisorLocationCoverageRow[];
    overlapping: SupervisorLocationCoverageRow[];
  } | null;
  filters: SupervisorOperationsFilters | null;
  /** Phase 12A — Plant triage / WO queue projection (null when not Plant). */
  plantOperations: {
    newRequests: number;
    untriaged: number;
    urgent: number;
    outOfServiceAssets: number;
    openWorkOrders: number;
    inProgressWorkOrders: number;
    waitingVendor: number;
    waitingParts: number;
    overdueWorkOrders: number;
    unassignedWorkOrders: number;
    requests: Array<{
      id: string;
      requestCode: string;
      summary: string;
      status: string;
      priority: string;
      requestingDepartmentName: string;
      unitName: string;
      reportedAt: string;
      workOrderCode: string | null;
    }>;
    workOrders: Array<{
      id: string;
      repairCode: string;
      title: string;
      status: string;
      priority: string;
      assignedEmployeeName: string | null;
      unitName: string;
      dueAt: string | null;
      overdue: boolean;
    }>;
    requestingDepartments: Array<{ id: string; name: string }>;
    technicians: Array<{ id: string; name: string }>;
  } | null;
};
