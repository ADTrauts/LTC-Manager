import type { MealType } from "@prisma/client";
import { LogSubmissionStatus } from "@prisma/client";

import {
  isLogAssignmentInDueScope,
  isLogSubmissionInDueScope,
  type LogDueAssignmentRow,
  type LogDueSubmissionRow,
} from "@/lib/operations/scope-log-due-queries";

export type MealScopedLogCounts = {
  expected: number;
  completed: number;
  failed: number;
  missed: number;
  pending: number;
};

/**
 * Readiness always scopes meal-bound logs to the active meal/operation.
 * All-day (null mealType) assignments:
 * - failed/missed submissions still count (already overdue/failed)
 * - pending/expected do not count — incomplete later-day or undated logs must not
 *   prevent Ready or create In Progress before they are due
 */
export function computeMealScopedLogCounts(input: {
  assignments: Array<LogDueAssignmentRow & { unitId?: string; timesPerDay: number }>;
  submissions: Array<
    LogDueSubmissionRow & {
      unitId?: string;
      status: LogSubmissionStatus;
    }
  >;
  unitId: string;
  mealType: MealType;
}): MealScopedLogCounts {
  const unitAssignments = input.assignments.filter(
    (assignment) => !("unitId" in assignment) || assignment.unitId == null || assignment.unitId === input.unitId,
  );
  const unitSubmissions = input.submissions.filter(
    (submission) => !("unitId" in submission) || submission.unitId == null || submission.unitId === input.unitId,
  );

  const mealBoundAssignments = unitAssignments.filter(
    (assignment) => assignment.mealType !== null && isLogAssignmentInDueScope(assignment, input.mealType),
  );
  const allDayAssignments = unitAssignments.filter((assignment) => assignment.mealType === null);

  const scopedAssignments = [...mealBoundAssignments, ...allDayAssignments];
  const scopedSubmissions = unitSubmissions.filter((submission) =>
    isLogSubmissionInDueScope(submission, scopedAssignments, input.mealType),
  );

  // Expected/pending: meal-bound only (exclude all-day from completion pressure).
  const expected = mealBoundAssignments.reduce((sum, item) => sum + item.timesPerDay, 0);
  const mealBoundAssignmentIds = new Set(mealBoundAssignments.map((item) => item.id));
  const mealBoundTemplateNames = new Set(
    mealBoundAssignments.map((item) => item.template?.name).filter(Boolean),
  );

  const mealBoundSubmissions = scopedSubmissions.filter((submission) => {
    if (submission.assignmentId && mealBoundAssignmentIds.has(submission.assignmentId)) return true;
    if (submission.mealType === input.mealType) return true;
    if (submission.template?.name && mealBoundTemplateNames.has(submission.template.name)) return true;
    return false;
  });

  // Failed/missed: include meal-bound + all-day (critical already-failed work).
  const failed = scopedSubmissions.filter((item) => item.status === LogSubmissionStatus.FAILED).length;
  const missed = scopedSubmissions.filter((item) => item.status === LogSubmissionStatus.MISSED).length;
  const completed = mealBoundSubmissions.filter(
    (item) => item.status === LogSubmissionStatus.COMPLETED,
  ).length;
  const pending = Math.max(expected - mealBoundSubmissions.length, 0);

  return { expected, completed, failed, missed, pending };
}
