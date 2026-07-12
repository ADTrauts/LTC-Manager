import type { InspectionResult, PrismaClient, Task } from "@prisma/client";

import {
  completedAtForTaskStatus,
} from "@/lib/work/task-mappings";
import {
  runGuardedTaskSync,
  type TaskSyncDeps,
  type TaskSyncOutcome,
} from "@/lib/work/run-guarded-task-sync";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type InspectionSubmissionTaskSource = {
  id: string;
  facilityId: string;
  departmentId: string | null;
  unitId: string | null;
  operationInstanceId: string | null;
  submittedByEmployeeId: string | null;
  submittedAt: Date;
  result: InspectionResult;
  notes: string | null;
  definitionName: string;
};

export type InspectionTaskDb = Pick<PrismaClient, "task">;

/**
 * Preferred Wave 7b rule: the inspection execution Task is COMPLETED when submitted.
 * Findings/failures may generate separate follow-up Tasks in a later milestone.
 */
export function mapInspectionResultToTaskStatus(
  result: InspectionResult,
): "COMPLETED" {
  void result;
  return "COMPLETED";
}

export function buildInspectionTaskUpsertInput(
  submission: InspectionSubmissionTaskSource,
) {
  const status = mapInspectionResultToTaskStatus(submission.result);
  const completedAt = completedAtForTaskStatus(
    status,
    submission.submittedAt,
    submission.submittedAt,
  );

  const findingHint =
    submission.result === "PASSED"
      ? null
      : submission.result === "PASSED_WITH_FINDINGS"
        ? "Completed with findings"
        : "Completed with failures";

  const description = [findingHint, submission.notes].filter(Boolean).join(" — ") || null;

  return {
    facilityId: submission.facilityId,
    departmentId: submission.departmentId,
    unitId: submission.unitId,
    operationInstanceId: submission.operationInstanceId,
    type: "INSPECTION" as const,
    title: `Inspection: ${submission.definitionName}`,
    description,
    status,
    priority: "MEDIUM" as const,
    dueAt: null as Date | null,
    completedAt,
    assignedEmployeeId: submission.submittedByEmployeeId,
    sourceType: "INSPECTION_SUBMISSION" as const,
    sourceId: submission.id,
  };
}

async function upsertInspectionTask(
  db: InspectionTaskDb,
  submission: InspectionSubmissionTaskSource,
): Promise<Task> {
  const data = buildInspectionTaskUpsertInput(submission);
  return db.task.upsert({
    where: {
      facilityId_sourceType_sourceId: {
        facilityId: data.facilityId,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
      },
    },
    create: data,
    update: {
      departmentId: data.departmentId,
      unitId: data.unitId,
      operationInstanceId: data.operationInstanceId,
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      completedAt: data.completedAt,
      assignedEmployeeId: data.assignedEmployeeId,
    },
  });
}

/** Idempotent Task projection for an inspection submission. Never throws to callers. */
export async function syncInspectionRecordToTask(
  submission: InspectionSubmissionTaskSource,
  deps: TaskSyncDeps & { db?: InspectionTaskDb } = {},
): Promise<TaskSyncOutcome> {
  const db = deps.db ?? defaultPrisma;
  return runGuardedTaskSync(
    "inspection submission → Task",
    { submissionId: submission.id },
    () => upsertInspectionTask(db, submission),
    deps,
  );
}
