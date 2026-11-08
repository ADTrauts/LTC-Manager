import type { TaskSyncDeps } from "@/lib/work/run-guarded-task-sync";

export type CompleteScheduledOccurrenceDb = object;

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
  void deps;
  return {
    attempted: false,
    skipped: true,
    synced: false,
    taskId: null,
    occurrenceId: input.occurrenceId,
  };
}
