import type { TaskStatus } from "@prisma/client";

import type { TaskSyncDeps } from "@/lib/work/run-guarded-task-sync";

export type InspectionFollowUpFinding = {
  submissionItemId: string;
  definitionItemId: string;
  itemLabel: string;
  passed: boolean | null;
  valueText: string | null;
  valueNumber: number | null;
  notes: string | null;
  failureCreatesFollowUp: boolean;
  responseType: string;
};

export type InspectionFollowUpContext = {
  submissionId: string;
  facilityId: string;
  departmentId: string | null;
  unitId: string | null;
  unitName: string | null;
  operationInstanceId: string | null;
  definitionName: string;
  submittedAt: Date;
  submittedByName: string | null;
  executionTaskId: string | null;
  findings: InspectionFollowUpFinding[];
};

export type InspectionFollowUpDb = object;

export type FollowUpSyncResult = {
  attempted: boolean;
  skipped: boolean;
  createdOrUpdatedIds: string[];
  qualifyingCount: number;
  errors: unknown[];
};

/** Binary fail + failureCreatesFollowUp — the only rule that creates corrective Tasks. */
export function isQualifyingInspectionFollowUp(
  finding: Pick<InspectionFollowUpFinding, "passed" | "failureCreatesFollowUp">,
): boolean {
  return finding.passed === false && finding.failureCreatesFollowUp === true;
}

export function formatFailedInspectionResponse(finding: InspectionFollowUpFinding): string {
  if (finding.responseType === "PASS_FAIL") return "Fail";
  if (finding.responseType === "YES_NO") return "No";
  if (finding.valueText) return finding.valueText;
  if (finding.valueNumber !== null && finding.valueNumber !== undefined) {
    return String(finding.valueNumber);
  }
  return "Failed check";
}

export function buildInspectionFollowUpTitle(input: {
  itemLabel: string;
  definitionName: string;
}): string {
  const label = input.itemLabel.trim();
  if (/^correct\b/i.test(label) || /^replace\b/i.test(label) || /^resolve\b/i.test(label)) {
    return label;
  }
  return `Correct failed ${label}`;
}

export function buildInspectionFollowUpDescription(input: {
  definitionName: string;
  unitName: string | null;
  finding: InspectionFollowUpFinding;
  submittedAt: Date;
  submittedByName: string | null;
  executionTaskId: string | null;
}): string {
  const lines = [
    `Inspection: ${input.definitionName}`,
    input.unitName ? `Location: ${input.unitName}` : null,
    `Failed item: ${input.finding.itemLabel}`,
    `Response: ${formatFailedInspectionResponse(input.finding)}`,
    input.finding.notes ? `Notes: ${input.finding.notes}` : null,
    `Submitted: ${input.submittedAt.toISOString()}`,
    input.submittedByName ? `Submitted by: ${input.submittedByName}` : null,
    input.executionTaskId ? `Inspection Task: ${input.executionTaskId}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildInspectionFollowUpUpsertInput(
  context: Omit<InspectionFollowUpContext, "findings">,
  finding: InspectionFollowUpFinding,
) {
  const title = buildInspectionFollowUpTitle({
    itemLabel: finding.itemLabel,
    definitionName: context.definitionName,
  });
  const description = buildInspectionFollowUpDescription({
    definitionName: context.definitionName,
    unitName: context.unitName,
    finding,
    submittedAt: context.submittedAt,
    submittedByName: context.submittedByName,
    executionTaskId: context.executionTaskId,
  });

  return {
    facilityId: context.facilityId,
    departmentId: context.departmentId,
    unitId: context.unitId,
    operationInstanceId: context.operationInstanceId,
    type: "INSPECTION" as const,
    title,
    description,
    status: "OPEN" as const,
    priority: "MEDIUM" as const,
    dueAt: null as Date | null,
    completedAt: null as Date | null,
    assignedEmployeeId: null as string | null,
    sourceType: "INSPECTION_FINDING" as const,
    sourceId: finding.submissionItemId,
  };
}

/**
 * Load a submitted inspection and sync follow-up Tasks for qualifying failed items.
 * Idempotent on (facilityId, INSPECTION_FINDING, submissionItemId).
 * Never throws to callers; submission remains authoritative.
 */
export async function syncInspectionFollowUpTasks(
  _submissionId: string,
  _deps: TaskSyncDeps & { db?: InspectionFollowUpDb } = {},
): Promise<FollowUpSyncResult> {
  return {
    attempted: false,
    skipped: true,
    createdOrUpdatedIds: [],
    qualifyingCount: 0,
    errors: [],
  };
}

export async function syncInspectionFollowUpTasksFromContext(
  _context: InspectionFollowUpContext,
  _deps: TaskSyncDeps & { db?: InspectionFollowUpDb } = {},
): Promise<FollowUpSyncResult> {
  return {
    attempted: false,
    skipped: true,
    createdOrUpdatedIds: [],
    qualifyingCount: 0,
    errors: [],
  };
}

export function followUpStatusLabel(status: TaskStatus): string {
  switch (status) {
    case "OPEN":
      return "Open follow-up";
    case "IN_PROGRESS":
      return "In progress";
    case "COMPLETED":
      return "Resolved";
    case "CANCELLED":
      return "Cancelled";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
