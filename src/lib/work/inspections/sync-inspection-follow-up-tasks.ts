import type { PrismaClient, Task, TaskStatus } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  runGuardedTaskSync,
  type TaskSyncDeps,
} from "@/lib/work/run-guarded-task-sync";
import { isTaskSyncEnabled } from "@/lib/feature-flags";

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

export type InspectionFollowUpDb = Pick<
  PrismaClient,
  "task" | "inspectionSubmission"
>;

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
  submissionId: string,
  deps: TaskSyncDeps & { db?: InspectionFollowUpDb } = {},
): Promise<FollowUpSyncResult> {
  const isEnabled = deps.isEnabled ?? isTaskSyncEnabled;
  if (!isEnabled()) {
    return {
      attempted: false,
      skipped: true,
      createdOrUpdatedIds: [],
      qualifyingCount: 0,
      errors: [],
    };
  }

  const db = deps.db ?? defaultPrisma;

  const submission = await db.inspectionSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      facilityId: true,
      unitId: true,
      operationInstanceId: true,
      submittedAt: true,
      taskId: true,
      unit: { select: { name: true } },
      definition: { select: { name: true, departmentId: true } },
      submittedByEmployee: { select: { firstName: true, lastName: true } },
      items: {
        select: {
          id: true,
          passed: true,
          valueText: true,
          valueNumber: true,
          notes: true,
          definitionItem: {
            select: {
              id: true,
              label: true,
              failureCreatesFollowUp: true,
              responseType: true,
            },
          },
        },
      },
    },
  });

  if (!submission) {
    return {
      attempted: true,
      skipped: false,
      createdOrUpdatedIds: [],
      qualifyingCount: 0,
      errors: [new Error(`InspectionSubmission not found: ${submissionId}`)],
    };
  }

  const context: InspectionFollowUpContext = {
    submissionId: submission.id,
    facilityId: submission.facilityId,
    departmentId: submission.definition.departmentId,
    unitId: submission.unitId,
    unitName: submission.unit?.name ?? null,
    operationInstanceId: submission.operationInstanceId,
    definitionName: submission.definition.name,
    submittedAt: submission.submittedAt,
    submittedByName: submission.submittedByEmployee
      ? `${submission.submittedByEmployee.firstName} ${submission.submittedByEmployee.lastName}`
      : null,
    executionTaskId: submission.taskId,
    findings: submission.items.map((item) => ({
      submissionItemId: item.id,
      definitionItemId: item.definitionItem.id,
      itemLabel: item.definitionItem.label,
      passed: item.passed,
      valueText: item.valueText,
      valueNumber: item.valueNumber,
      notes: item.notes,
      failureCreatesFollowUp: item.definitionItem.failureCreatesFollowUp,
      responseType: item.definitionItem.responseType,
    })),
  };

  return syncInspectionFollowUpTasksFromContext(context, {
    ...deps,
    db: { task: db.task },
  });
}

export async function syncInspectionFollowUpTasksFromContext(
  context: InspectionFollowUpContext,
  deps: TaskSyncDeps & { db?: Pick<PrismaClient, "task"> } = {},
): Promise<FollowUpSyncResult> {
  const isEnabled = deps.isEnabled ?? isTaskSyncEnabled;
  if (!isEnabled()) {
    return {
      attempted: false,
      skipped: true,
      createdOrUpdatedIds: [],
      qualifyingCount: 0,
      errors: [],
    };
  }

  const db = deps.db ?? defaultPrisma;
  const qualifying = context.findings.filter(isQualifyingInspectionFollowUp);
  const createdOrUpdatedIds: string[] = [];
  const errors: unknown[] = [];

  for (const finding of qualifying) {
    const outcome = await runGuardedTaskSync(
      "inspection finding → follow-up Task",
      {
        submissionId: context.submissionId,
        submissionItemId: finding.submissionItemId,
      },
      async () => {
        const data = buildInspectionFollowUpUpsertInput(context, finding);
        const existing = await db.task.findUnique({
          where: {
            facilityId_sourceType_sourceId: {
              facilityId: data.facilityId,
              sourceType: data.sourceType,
              sourceId: data.sourceId,
            },
          },
          select: { id: true, status: true },
        });

        // Preserve lifecycle status on re-sync; only fill missing projections or refresh metadata.
        if (existing) {
          return db.task.update({
            where: { id: existing.id },
            data: {
              departmentId: data.departmentId,
              unitId: data.unitId,
              operationInstanceId: data.operationInstanceId,
              title: data.title,
              description: data.description,
              // Do not reset status/completedAt/assignedEmployeeId on re-sync.
            },
          });
        }

        return db.task.create({ data });
      },
      { isEnabled: () => true },
    );

    if (outcome.ok && !outcome.skipped) {
      createdOrUpdatedIds.push(outcome.task.id);
    } else if (!outcome.ok) {
      errors.push(outcome.error);
    }
  }

  return {
    attempted: true,
    skipped: false,
    createdOrUpdatedIds,
    qualifyingCount: qualifying.length,
    errors,
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

export type { Task };
