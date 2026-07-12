import type { IssueType, RepairPriority, RepairStatus } from "@prisma/client";

import type { AppIconKey } from "@/lib/design-system/icons";
import type { StatusBadgeVariant } from "@/lib/design-system/status-styles";
import { issueTypeLabel } from "@/lib/repair-routing";

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

const COPY: Record<IssueType, IssueCopyBundle> = {
  EQUIPMENT: {
    typeLabel: "Equipment issue",
    noun: "equipment issue",
    inProgressPhrase: "Repair in progress",
    resolvedPhrase: "Equipment restored",
    reportedPhrase: "Equipment issue reported",
  },
  SUPPLY_SHORT: {
    typeLabel: "Supply shortage",
    noun: "supply shortage",
    inProgressPhrase: "Restocking in progress",
    resolvedPhrase: "Supply restored",
    reportedPhrase: "Supply shortage reported",
  },
  ENVIRONMENT: {
    typeLabel: "Environmental issue",
    noun: "environmental issue",
    inProgressPhrase: "Area service in progress",
    resolvedPhrase: "Condition resolved",
    reportedPhrase: "Environmental issue reported",
  },
  SAFETY: {
    typeLabel: "Safety issue",
    noun: "safety issue",
    inProgressPhrase: "Immediate attention required",
    resolvedPhrase: "Safety issue resolved",
    reportedPhrase: "Safety issue reported",
  },
  SERVICE_DISRUPTION: {
    typeLabel: "Service disruption",
    noun: "service disruption",
    inProgressPhrase: "Recovery in progress",
    resolvedPhrase: "Service restored",
    reportedPhrase: "Service disruption reported",
  },
  OTHER: {
    typeLabel: "Operational issue",
    noun: "operational issue",
    inProgressPhrase: "Work in progress",
    resolvedPhrase: "Issue resolved",
    reportedPhrase: "Operational issue reported",
  },
};

export function getIssueCopy(issueType: IssueType): IssueCopyBundle {
  return COPY[issueType] ?? COPY.OTHER;
}

export function issueTypeDisplayLabel(issueType: IssueType): string {
  return getIssueCopy(issueType).typeLabel;
}

/** Short label for dense lists (queue chips). */
export function issueTypeShortLabel(issueType: IssueType): string {
  return issueTypeLabel(issueType);
}

export function issueTypeIconKey(issueType: IssueType): AppIconKey {
  switch (issueType) {
    case "SUPPLY_SHORT":
      return "assets";
    case "SAFETY":
      return "warning";
    case "ENVIRONMENT":
      return "locationDefault";
    case "SERVICE_DISRUPTION":
      return "inProgress";
    case "OTHER":
      return "activity";
    case "EQUIPMENT":
    default:
      return "repairs";
  }
}

export function mapRepairStatusToRecoveryStage(input: {
  status: RepairStatus;
  assignedEmployeeId?: string | null;
}): IssueRecoveryStage {
  if (input.status === "CLOSED") return "RESOLVED";
  if (input.status === "WAITING_PARTS") return "WAITING";
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
  if (priority === "URGENT") return "blocked";
  if (priority === "HIGH") return "warning";
  return "neutral";
}

export function resolveIssueImpactSummary(input: {
  issueType: IssueType;
  priority: RepairPriority;
  status: RepairStatus;
}): string {
  const copy = getIssueCopy(input.issueType);
  if (input.status === "CLOSED") {
    return copy.resolvedPhrase;
  }
  if (input.priority === "URGENT" || input.issueType === "SAFETY") {
    return "Current operations may be disrupted until this is resolved.";
  }
  if (input.priority === "HIGH") {
    return "Significant impact if left unresolved during the current service window.";
  }
  return "Routine operational exception — track until closed.";
}

export function resolveIssueNextAction(input: {
  issueType: IssueType;
  status: RepairStatus;
  assignedEmployeeId?: string | null;
}): string {
  const copy = getIssueCopy(input.issueType);
  if (input.status === "CLOSED") {
    return "Reopen if the problem returns.";
  }
  if (input.status === "WAITING_PARTS") {
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
  issueType: IssueType;
  status: RepairStatus;
  assignedEmployeeId?: string | null;
}): string {
  const copy = getIssueCopy(input.issueType);
  const stage = mapRepairStatusToRecoveryStage(input);
  if (stage === "RESOLVED") return copy.resolvedPhrase;
  if (stage === "IN_PROGRESS" || stage === "WAITING") return copy.inProgressPhrase;
  if (stage === "ASSIGNED") return "Assigned — awaiting start";
  return copy.reportedPhrase;
}

/** Canonical detail path. Repair id is the issue id (ADL-008). */
export function issueDetailPath(issueId: string): string {
  return `/issues/${issueId}`;
}

/** Compatibility alias under legacy repairs namespace. */
export function repairDetailAliasPath(issueId: string): string {
  return `/repairs/${issueId}`;
}
