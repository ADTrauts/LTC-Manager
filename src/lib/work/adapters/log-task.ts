import type { LogSubmissionStatus } from "@prisma/client";

import {
  buildLogTaskTitle,
  completedAtForTaskStatus,
  mapLogSubmissionPriorityToTaskPriority,
  mapLogSubmissionStatusToTaskStatus,
} from "@/lib/work/task-mappings";
import {
  type TaskSyncDeps,
  type TaskSyncOutcome,
} from "@/lib/work/run-guarded-task-sync";
export type LogSubmissionTaskSource = {
  id: string;
  status: LogSubmissionStatus;
  notes: string | null;
  submittedAt: Date;
  unitId: string;
  mealType: string | null;
  submittedByEmployeeId: string | null;
  facilityId: string;
  departmentId: string | null;
  templateName: string;
};

export function buildLogTaskUpsertInput(submission: LogSubmissionTaskSource) {
  const status = mapLogSubmissionStatusToTaskStatus(submission.status);
  const priority = mapLogSubmissionPriorityToTaskPriority();
  const title = buildLogTaskTitle({
    templateName: submission.templateName,
    mealType: submission.mealType,
  });
  const completedAt = completedAtForTaskStatus(
    status,
    null,
    submission.submittedAt,
  );

  return {
    facilityId: submission.facilityId,
    departmentId: submission.departmentId,
    unitId: submission.unitId,
    operationInstanceId: null as string | null,
    type: "LOG" as const,
    title,
    description: submission.notes,
    status,
    priority,
    dueAt: null as Date | null,
    completedAt,
    assignedEmployeeId: submission.submittedByEmployeeId,
    sourceType: "LOG_SUBMISSION" as const,
    sourceId: submission.id,
  };
}

/** Task projection is retired. The log record stays the source of truth. */
export async function syncLogSubmissionToTask(
  _submissionId: string,
  _deps: TaskSyncDeps = {},
): Promise<TaskSyncOutcome> {
  return { ok: true, skipped: true, reason: "flag_disabled" };
}

/** Task projection is retired. The log record stays the source of truth. */
export async function syncLogSubmissionRecordToTask(
  _submission: LogSubmissionTaskSource,
  _deps: TaskSyncDeps = {},
): Promise<TaskSyncOutcome> {
  return { ok: true, skipped: true, reason: "flag_disabled" };
}
