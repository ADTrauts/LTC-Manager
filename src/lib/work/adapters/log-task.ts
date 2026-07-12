import type { LogSubmissionStatus, PrismaClient, Task } from "@prisma/client";

import {
  buildLogTaskTitle,
  completedAtForTaskStatus,
  mapLogSubmissionPriorityToTaskPriority,
  mapLogSubmissionStatusToTaskStatus,
} from "@/lib/work/task-mappings";
import {
  runGuardedTaskSync,
  type TaskSyncDeps,
  type TaskSyncOutcome,
} from "@/lib/work/run-guarded-task-sync";
import { prisma as defaultPrisma } from "@/lib/prisma";

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

export type LogTaskDb = Pick<PrismaClient, "task" | "logSubmission">;

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

async function upsertLogTask(
  db: LogTaskDb,
  submission: LogSubmissionTaskSource,
): Promise<Task> {
  const data = buildLogTaskUpsertInput(submission);
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
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      completedAt: data.completedAt,
      assignedEmployeeId: data.assignedEmployeeId,
    },
  });
}

/**
 * Upsert Task projection for a LogSubmission.
 * Idempotent on (facilityId, LOG_SUBMISSION, submissionId).
 * Never throws to callers — LogSubmission remains source of truth.
 */
export async function syncLogSubmissionToTask(
  submissionId: string,
  deps: TaskSyncDeps & { db?: LogTaskDb } = {},
): Promise<TaskSyncOutcome> {
  const db = deps.db ?? defaultPrisma;

  return runGuardedTaskSync(
    "log submission → Task",
    { submissionId },
    async () => {
      const row = await db.logSubmission.findUnique({
        where: { id: submissionId },
        select: {
          id: true,
          status: true,
          notes: true,
          submittedAt: true,
          unitId: true,
          mealType: true,
          submittedByEmployeeId: true,
          unit: { select: { facilityId: true } },
          template: { select: { name: true, departmentId: true } },
        },
      });

      if (!row) {
        throw new Error(`LogSubmission not found: ${submissionId}`);
      }

      return upsertLogTask(db, {
        id: row.id,
        status: row.status,
        notes: row.notes,
        submittedAt: row.submittedAt,
        unitId: row.unitId,
        mealType: row.mealType,
        submittedByEmployeeId: row.submittedByEmployeeId,
        facilityId: row.unit.facilityId,
        departmentId: row.template.departmentId,
        templateName: row.template.name,
      });
    },
    deps,
  );
}

/** Sync from an already-loaded submission projection (preferred after create). */
export async function syncLogSubmissionRecordToTask(
  submission: LogSubmissionTaskSource,
  deps: TaskSyncDeps & { db?: LogTaskDb } = {},
): Promise<TaskSyncOutcome> {
  const db = deps.db ?? defaultPrisma;
  return runGuardedTaskSync(
    "log submission → Task",
    { submissionId: submission.id },
    () => upsertLogTask(db, submission),
    deps,
  );
}
