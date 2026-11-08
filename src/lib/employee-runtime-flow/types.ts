/**
 * Phase 6J — derived Employee Runtime Flow.
 *
 * Not persisted. Not a second operational truth engine.
 * OA = responsibility. RLS = place operation / Harbor evidence / impact / milestones.
 * Compatibility Work Plans remain until Phase 2C removes them from composition.
 * Phase 2C-2A adds `items` as owner-referenced Job Flow rows (see job-flow-item.ts).
 */

import type { AssetOperationalImpact } from "@prisma/client";

import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";
import type { WorkRequirement } from "@/lib/department-work/types";
import type { EvidenceRequirement } from "@/lib/operational-evidence/types";
import type { LogRequirementProductState } from "@/lib/logs-architecture/types";
import type { RuntimeMilestoneKind } from "@/lib/runtime-location-state";

import type { JobFlowItem } from "./job-flow-item";

export type {
  JobFlowItem,
  JobFlowItemAttention,
  JobFlowItemPlace,
  JobFlowItemTime,
  JobFlowOwnerKind,
} from "./job-flow-item";

export type EmployeeRuntimeAssignmentAvailability =
  | "evaluated"
  | "unavailable"
  | "no_confirmed_assignment";

export type EmployeeRuntimeScopeKind = "SPACES" | "UNIT" | "NONE";

export type EmployeeRuntimeEvidenceMode = "harbor" | "template" | "none";

export type EmployeeRuntimeOperation =
  | { kind: "shared"; cycleStableKey: string; label: string }
  | { kind: "mixed"; count: number; labels: string[] }
  | { kind: "none" };

export type EmployeeEvidenceCategory =
  | "needs_attention"
  | "due_now"
  | "upcoming"
  | "completed";

export type EmployeeRuntimeLocation = {
  spaceId: string;
  displayName: string;
  unitId: string | null;
  unitName: string | null;
  floorName: string | null;
  neighborhoodName: string | null;
  operationalTypeKey: string | null;
  operationalTypeName: string | null;
  operationLabel: string | null;
  operationState: "ACTIVE" | "NONE";
};

export type EmployeeRuntimeEvidenceItem = {
  attachmentId: string;
  requirementKey: string;
  displayName: string;
  spaceId: string;
  productState: LogRequirementProductState;
  category: EmployeeEvidenceCategory;
  window: { start: string | null; end: string | null };
  recordId: string | null;
  href: string | null;
  catalogStableKey: string | null;
};

export type EmployeeRuntimeMilestone = {
  spaceId: string;
  spaceName: string;
  kind: RuntimeMilestoneKind;
  label: string;
  statusKey: string;
  /** Published Cycle stable key when the milestone is a Key Point. */
  cycleStableKey?: string | null;
  expectedLocal?: string | null;
  adjustedLocal?: string | null;
  actualLocal?: string | null;
  href?: string | null;
};

export type EmployeeRuntimeIssue = {
  spaceId: string;
  spaceName: string;
  assetId: string;
  issueId: string;
  summary: string;
  impact: AssetOperationalImpact;
  href: string | null;
};

export type EmployeeRuntimeNextKind =
  | "overdue_work"
  | "overdue_evidence"
  | "due_work"
  | "due_evidence"
  | "milestone"
  | "assignment_transition"
  | "upcoming_work"
  | "upcoming_evidence"
  | "location_next"
  | "none";

export type EmployeeRuntimeNextAction = {
  kind: EmployeeRuntimeNextKind;
  label: string;
  spaceId: string | null;
  sourceId: string;
};

export type EmployeeRuntimeLocationNext = {
  spaceId: string;
  label: string;
  at: Date;
};

export type EmployeeRuntimeFlow = {
  assignmentAvailability: EmployeeRuntimeAssignmentAvailability;
  currentAssignment: JobFlowAssignmentSnapshot | null;
  upcomingAssignment: JobFlowAssignmentSnapshot | null;
  previousAssignment: JobFlowAssignmentSnapshot | null;
  dayAssignments: JobFlowAssignmentSnapshot[];
  responsibility: {
    roleKey: string | null;
    roleLabel: string | null;
    unitId: string | null;
    unitName: string | null;
    scopeKind: EmployeeRuntimeScopeKind;
    assignedSpaceIds: string[];
  };
  locations: EmployeeRuntimeLocation[];
  operation: EmployeeRuntimeOperation;
  evidenceMode: EmployeeRuntimeEvidenceMode;
  evidence: EmployeeRuntimeEvidenceItem[];
  templateEvidence: EvidenceRequirement[];
  /** Compatibility Work requirements (plan-derived + one-off). Prefer `items` for new readers. */
  work: WorkRequirement[];
  /**
   * Owner-referenced Job Flow composition (Phase 2C-2A).
   * Includes compatibility Work plus Records / Key Points already on the flow.
   * Work Order / PM / Assignment exception slots stay empty until later wiring.
   */
  items: JobFlowItem[];
  milestones: EmployeeRuntimeMilestone[];
  issues: EmployeeRuntimeIssue[];
  next: EmployeeRuntimeNextAction;
  locationNext: EmployeeRuntimeLocationNext | null;
  device: {
    boundUnitId: string | null;
    assignmentUnitId: string | null;
    mismatch: boolean;
  };
  offline: {
    bundleRevision: string | null;
    lastSyncedAt: string | null;
    stale: boolean;
  };
};

export const EMPLOYEE_ASSIGNMENT_UNAVAILABLE_LABEL = "Assignment unavailable";
export const EMPLOYEE_NO_ACTIVE_OPERATION_LABEL = "No active operation";
