import type { PrismaClient } from "@prisma/client";

import { isTaskSyncEnabled } from "@/lib/feature-flags";
import { prisma as defaultPrisma } from "@/lib/prisma";
import type { TaskSyncDeps } from "@/lib/work/run-guarded-task-sync";

export type CompleteScheduledOccurrenceDb = Pick<
  PrismaClient,
  "inspectionOccurrence" | "task"
>;

export type CompleteScheduledOccurrenceResult = {
  attempted: boolean;
  skipped: boolean;
  synced: boolean;
  taskId: string | null;
  occurrenceId: string;
};

/**
 * Mark a scheduled InspectionOccurrence COMPLETED and complete its INSPECTION_OCCURRENCE Task.
 * Does not create an INSPECTION_SUBMISSION Task — the scheduled Task is the execution record.
 */
export async function completeScheduledInspectionOccurrence(
  input: {
    occurrenceId: string;
    facilityId: string;
    definitionId: string;
    submissionId: string;
    submittedAt: Date;
    submittedByEmployeeId?: string | null;
  },
  deps: TaskSyncDeps & { db?: CompleteScheduledOccurrenceDb } = {},
): Promise<CompleteScheduledOccurrenceResult> {
  const db = deps.db ?? defaultPrisma;
  const isEnabled = deps.isEnabled ?? isTaskSyncEnabled;

  const occurrence = await db.inspectionOccurrence.findFirst({
    where: {
      id: input.occurrenceId,
      facilityId: input.facilityId,
      definitionId: input.definitionId,
    },
    select: { id: true, taskId: true, status: true },
  });

  if (!occurrence) {
    return {
      attempted: true,
      skipped: false,
      synced: false,
      taskId: null,
      occurrenceId: input.occurrenceId,
    };
  }

  await db.inspectionOccurrence.update({
    where: { id: occurrence.id },
    data: { status: "COMPLETED" },
  });

  if (!isEnabled()) {
    return {
      attempted: false,
      skipped: true,
      synced: false,
      taskId: occurrence.taskId,
      occurrenceId: occurrence.id,
    };
  }

  try {
    let taskId = occurrence.taskId;
    if (taskId) {
      await db.task.update({
        where: { id: taskId },
        data: {
          status: "COMPLETED",
          completedAt: input.submittedAt,
          assignedEmployeeId: input.submittedByEmployeeId ?? undefined,
        },
      });
    } else {
      const existing = await db.task.findUnique({
        where: {
          facilityId_sourceType_sourceId: {
            facilityId: input.facilityId,
            sourceType: "INSPECTION_OCCURRENCE",
            sourceId: occurrence.id,
          },
        },
        select: { id: true },
      });
      if (existing) {
        taskId = existing.id;
        await db.task.update({
          where: { id: existing.id },
          data: {
            status: "COMPLETED",
            completedAt: input.submittedAt,
            assignedEmployeeId: input.submittedByEmployeeId ?? undefined,
          },
        });
        await db.inspectionOccurrence.update({
          where: { id: occurrence.id },
          data: { taskId: existing.id },
        });
      }
    }

    return {
      attempted: true,
      skipped: false,
      synced: Boolean(taskId),
      taskId,
      occurrenceId: occurrence.id,
    };
  } catch (error) {
    console.error("[work/inspections] failed to complete scheduled occurrence Task", {
      occurrenceId: occurrence.id,
      submissionId: input.submissionId,
      error,
    });
    return {
      attempted: true,
      skipped: false,
      synced: false,
      taskId: occurrence.taskId,
      occurrenceId: occurrence.id,
    };
  }
}
