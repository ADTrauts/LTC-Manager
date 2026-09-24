/**
 * Phase 6O — derived Supervisor Operations contract.
 * Not persisted. Do not add a Prisma model.
 */

import type { SupervisorEvidenceAttentionItem } from "../supervisor-evidence-attention";
import type {
  SupervisorExceptionTemporal,
  SupervisorLocationCoverageRow,
  SupervisorOperationsBoard,
  SupervisorOperationsFilters,
} from "../types";

export type SupervisorOperationKind = "shared" | "mixed" | "none";

export type SupervisorDomainAvailability = "available" | "unavailable";

export type SupervisorAttentionItem = {
  status: string;
  temporal: SupervisorExceptionTemporal;
  unitId?: string | null;
  unitName?: string | null;
  locationLabel?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  cycleLabel?: string | null;
  time?: string | null;
  sourceHref: string;
  availableActions: string[];
};

export type SupervisorPresenceEmployee = {
  id: string;
  name: string;
  hasCallOff: boolean;
};

export type SupervisorAssignmentFact = {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  unitId: string | null;
  unitName: string | null;
  roleKey: string;
  roleLabel: string;
  status: string;
};

export type SupervisorCoverageGap = {
  unitId: string | null;
  unitName: string | null;
  locationLabel: string | null;
  roleKey: string;
  roleLabel: string;
  state: "AT_RISK" | "UNCOVERED";
  requiredCount: number;
  filledCount: number;
};

export type SupervisorWorkFact = {
  occurrenceKey: string;
  label: string;
  unitId: string | null;
  unitName: string | null;
  state: string;
  assignedEmployeeId: string | null;
};

export type SupervisorSyncItem = {
  kind: "retry_required" | "pending_conflict";
  unitId: string;
  unitName: string | null;
};

export type SupervisorOperationsViewModel = {
  identity: {
    facilityId: string;
    facilityName: string;
    departmentId: string;
    departmentName: string;
    departmentKey: string;
    operationalDateKey: string;
    timezone: string;
    lastUpdated: string;
  };
  operation: {
    kind: SupervisorOperationKind;
    label: string;
    currentLabel: string | null;
    nextLabel: string | null;
    activeLabels: string[];
  };
  plan: {
    status: string | null;
  };
  presence: {
    availability: "available";
    scheduledCount: number;
    callOffCount: number;
    scheduledEmployees: SupervisorPresenceEmployee[];
  };
  assignments: {
    availability: SupervisorDomainAvailability;
    assignedCount: number;
    assignments: SupervisorAssignmentFact[];
    callOffAffectsAssignment: SupervisorPresenceEmployee[];
  };
  coverage: {
    availability: SupervisorDomainAvailability;
    engine: "dietary" | "evs" | "none";
    covered: number;
    atRisk: number;
    uncovered: number;
    gaps: SupervisorCoverageGap[];
  };
  needsAttention: {
    people: SupervisorAttentionItem[];
    coverage: SupervisorAttentionItem[];
    milestones: SupervisorAttentionItem[];
    evidence: SupervisorEvidenceAttentionItem[];
    assets: SupervisorAttentionItem[];
    work: SupervisorAttentionItem[];
    sync: SupervisorAttentionItem[];
    configuration: SupervisorAttentionItem[];
  };
  historicalAttention: SupervisorEvidenceAttentionItem[];
  people: {
    callOffsAffectingAssignment: SupervisorPresenceEmployee[];
  };
  sync: {
    retryRequired: number;
    pendingConflicts: number;
    items: SupervisorSyncItem[];
    /** True when an item was excluded because it could not be department-scoped. */
    unscopableExcluded: boolean;
  };
  overlay: {
    dietary: {
      readyConfirmed: number;
      readyNotConfirmed: number;
      started: number;
      startedLate: number;
      startedNotConfirmed: number;
    } | null;
    evs: {
      locationCovered: number;
      locationAtRisk: number;
      locationUncovered: number;
      locationOverlapping: number;
      locationRequired: number;
      visibleUnitIds: string[] | null;
      locationCoverage: {
        unassigned: SupervisorLocationCoverageRow[];
        overlapping: SupervisorLocationCoverageRow[];
      };
      filters: SupervisorOperationsFilters;
    } | null;
    plant: SupervisorOperationsBoard["plantOperations"];
  };
  units: Array<{
    unitId: string;
    unitName: string;
    unitType: string;
    cycleLabel: string | null;
    cycleState: string;
    mealTargetTime: string | null;
    milestoneLabel: string | null;
    coverageState: string | null;
    workspaceHref: string;
  }>;
};
