import type { InspectionResult } from "@prisma/client";

import {
  completedAtForTaskStatus,
} from "@/lib/work/task-mappings";
import {
  type TaskSyncDeps,
  type TaskSyncOutcome,
} from "@/lib/work/run-guarded-task-sync";
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

/** Task projection is retired. Inspection results stay on the Record. */
export async function syncInspectionRecordToTask(
  _submission: InspectionSubmissionTaskSource,
  _deps: TaskSyncDeps = {},
): Promise<TaskSyncOutcome> {
  return { ok: true, skipped: true, reason: "flag_disabled" };
}
