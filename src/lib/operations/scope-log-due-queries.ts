import type { LogSubmissionStatus, MealType } from "@prisma/client";

import { isOperationEngineEnabled } from "@/lib/feature-flags";

import type { ResolvedActiveOperation } from "./types";

export type LogDueAssignmentRow = {
  id: string;
  mealType: MealType | null;
  timesPerDay: number;
  template?: { name: string };
  templateId?: string;
};

export type LogDueSubmissionRow = {
  id: string;
  status: LogSubmissionStatus;
  mealType?: MealType | null;
  assignmentId?: string | null;
  template?: { name: string };
  templateId?: string;
};

function isMealBoundActiveOperation(
  activeOperation: Pick<ResolvedActiveOperation, "source" | "operationContext">,
): boolean {
  if (activeOperation.source !== "operation_instance") {
    return false;
  }
  const { mealLabel, serviceLabel } = activeOperation.operationContext;
  return serviceLabel === `${mealLabel} service`;
}

/**
 * Returns a meal type to narrow log due queries, or `undefined` when legacy behavior applies.
 */
export function resolveLogDueMealScope(
  activeOperation: Pick<ResolvedActiveOperation, "source" | "operationContext"> | null,
  engineEnabled: boolean = isOperationEngineEnabled(),
): MealType | undefined {
  if (!engineEnabled || !activeOperation || !isMealBoundActiveOperation(activeOperation)) {
    return undefined;
  }

  return activeOperation.operationContext.mealType;
}

export function isLogAssignmentInDueScope(
  assignment: Pick<LogDueAssignmentRow, "mealType">,
  mealScope: MealType | undefined,
): boolean {
  if (mealScope === undefined) {
    return true;
  }
  if (assignment.mealType === null) {
    return true;
  }
  return assignment.mealType === mealScope;
}

export function isLogSubmissionInDueScope(
  submission: LogDueSubmissionRow,
  scopedAssignments: LogDueAssignmentRow[],
  mealScope: MealType | undefined,
): boolean {
  if (mealScope === undefined) {
    return true;
  }

  const scopedAssignmentIds = new Set(scopedAssignments.map((assignment) => assignment.id));
  if (submission.assignmentId && scopedAssignmentIds.has(submission.assignmentId)) {
    return true;
  }

  const templateName = submission.template?.name;
  if (!templateName) {
    return false;
  }

  const matchesScopedAssignment = scopedAssignments.some(
    (assignment) => assignment.template?.name === templateName,
  );
  if (!matchesScopedAssignment) {
    return false;
  }

  if (submission.mealType != null && submission.mealType !== mealScope) {
    return false;
  }

  return true;
}

export function scopeLogDueQueries<
  TAssignment extends LogDueAssignmentRow,
  TSubmission extends LogDueSubmissionRow,
>(input: {
  assignments: TAssignment[];
  submissions: TSubmission[];
  activeOperation: Pick<ResolvedActiveOperation, "source" | "operationContext"> | null;
  engineEnabled?: boolean;
}): { assignments: TAssignment[]; submissions: TSubmission[] } {
  const mealScope = resolveLogDueMealScope(
    input.activeOperation,
    input.engineEnabled ?? isOperationEngineEnabled(),
  );

  if (mealScope === undefined) {
    return {
      assignments: input.assignments,
      submissions: input.submissions,
    };
  }

  const assignments = input.assignments.filter((assignment) =>
    isLogAssignmentInDueScope(assignment, mealScope),
  );
  const submissions = input.submissions.filter((submission) =>
    isLogSubmissionInDueScope(submission, assignments, mealScope),
  );

  return { assignments, submissions };
}
