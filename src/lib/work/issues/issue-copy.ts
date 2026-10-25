import type { RepairPriority, RepairStatus } from "@prisma/client";

import type { StatusBadgeVariant } from "@/lib/design-system/status-styles";

/**
 * Repair detail copy. Repair is the Work Order row. It is not canonical Issue.
 * AssetIssue is the Issue store. OperationalRequest is intake.
 */

/** User-facing recovery stage (display only — maps onto RepairStatus + assignment). */
export type IssueRecoveryStage =
  | "REPORTED"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "WAITING"
  | "RESOLVED";

export type IssueCopyBundle = {
  typeLabel: string;
  noun: string;
  inProgressPhrase: string;
  resolvedPhrase: string;
  reportedPhrase: string;
};

const WORK_ORDER_COPY: IssueCopyBundle = {
  typeLabel: "Work order",
  noun: "work order",
  inProgressPhrase: "Work in progress",
  resolvedPhrase: "Work completed",
  reportedPhrase: "Work order reported",
};

export function getIssueCopy(): IssueCopyBundle {
  return WORK_ORDER_COPY;
}

export function mapRepairStatusToRecoveryStage(input: {
  status: RepairStatus;
  assignedEmployeeId?: string | null;
}): IssueRecoveryStage {
  if (input.status === "COMPLETED") return "RESOLVED";
  if (input.status === "WAITING_ON_VENDOR" || input.status === "ON_HOLD") {
    return "WAITING";
  }
  if (input.status === "IN_PROGRESS") return "IN_PROGRESS";
  if (input.assignedEmployeeId) return "ASSIGNED";
  return "REPORTED";
}

export const RECOVERY_STAGE_LABEL: Record<IssueRecoveryStage, string> = {
  REPORTED: "Reported",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  WAITING: "Waiting",
  RESOLVED: "Resolved",
};

export function recoveryStageLabel(stage: IssueRecoveryStage): string {
  return RECOVERY_STAGE_LABEL[stage];
}

export function recoveryStageBadgeVariant(stage: IssueRecoveryStage): StatusBadgeVariant {
  switch (stage) {
    case "RESOLVED":
      return "success";
    case "IN_PROGRESS":
    case "WAITING":
      return "in_progress";
    case "ASSIGNED":
      return "warning";
    case "REPORTED":
    default:
      return "neutral";
  }
}

export function priorityBadgeVariant(priority: RepairPriority): StatusBadgeVariant {
  if (priority === "URGENT" || priority === "EMERGENCY") return "blocked";
  if (priority === "HIGH") return "warning";
  return "neutral";
}

export function resolveIssueImpactSummary(input: {
  priority: RepairPriority;
  status: RepairStatus;
}): string {
  const copy = getIssueCopy();
  if (input.status === "COMPLETED") {
    return copy.resolvedPhrase;
  }
  if (input.priority === "URGENT" || input.priority === "EMERGENCY") {
    return "Current operations may be disrupted until this is resolved.";
  }
  if (input.priority === "HIGH") {
    return "Significant impact if left unresolved during the current service window.";
  }
  return "Routine operational exception — track until closed.";
}

export function resolveIssueNextAction(input: {
  status: RepairStatus;
  assignedEmployeeId?: string | null;
}): string {
  const copy = getIssueCopy();
  if (input.status === "COMPLETED") {
    return "Reopen if the problem returns.";
  }
  if (input.status === "ON_HOLD" || input.status === "WAITING_ON_VENDOR") {
    return "Update when parts or supplies arrive, then resume work.";
  }
  if (input.status === "IN_PROGRESS") {
    return `Continue recovery — add progress notes until ${copy.resolvedPhrase.toLowerCase()}.`;
  }
  if (!input.assignedEmployeeId) {
    return "Assign an owner and start recovery work.";
  }
  return "Start work and record progress.";
}

export function resolveIssueRecoveryStatePhrase(input: {
  status: RepairStatus;
  assignedEmployeeId?: string | null;
}): string {
  const copy = getIssueCopy();
  const stage = mapRepairStatusToRecoveryStage(input);
  if (stage === "RESOLVED") return copy.resolvedPhrase;
  if (stage === "IN_PROGRESS" || stage === "WAITING") return copy.inProgressPhrase;
  if (stage === "ASSIGNED") return "Assigned — awaiting start";
  return copy.reportedPhrase;
}

/** Canonical Repair detail path (Repair remains SoT). */
export function issueDetailPath(repairId: string): string {
  return `/repairs/${repairId}`;
}

/** @deprecated Prefer issueDetailPath — same canonical /repairs path. */
export function repairDetailAliasPath(repairId: string): string {
  return `/repairs/${repairId}`;
}
