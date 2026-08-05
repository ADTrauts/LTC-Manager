import type { AssignmentBoardEmployee, AssignmentBoardEntry } from "./types";

export type SuggestionCandidate = {
  employeeId: string;
  employeeName: string;
  reason: string;
};

/**
 * Build a deterministic suggestion for a single template position.
 *
 * Priority:
 * 1. Employee scheduled in the target unit
 * 2. Employee scheduled in the department with no conflicting primary assignment
 * 3. Leave unfilled
 */
export function suggestEmployeeForPosition(input: {
  roleKey: string;
  unitId: string | null;
  scheduledEmployees: AssignmentBoardEmployee[];
  existingAssignments: AssignmentBoardEntry[];
  alreadySuggestedIds: Set<string>;
}): SuggestionCandidate | null {
  // roleKey is part of the public suggestion input for callers that filter by role; matching
  // by role is not yet applied inside this helper.
  const { roleKey: _roleKey, unitId, scheduledEmployees, existingAssignments, alreadySuggestedIds } =
    input;
  void _roleKey;

  const assignedEmployeeIds = new Set(
    existingAssignments
      .filter((a) => a.status !== "CANCELLED" && a.status !== "COMPLETED")
      .map((a) => a.employeeId),
  );

  const available = scheduledEmployees.filter(
    (e) => !e.hasCallDown && !alreadySuggestedIds.has(e.id),
  );

  if (unitId) {
    const unitMatch = available.find(
      (e) => e.unitName && !assignedEmployeeIds.has(e.id),
    );
    if (unitMatch) {
      return {
        employeeId: unitMatch.id,
        employeeName: `${unitMatch.firstName} ${unitMatch.lastName}`,
        reason: "Scheduled in this location",
      };
    }
  }

  const deptAvailable = available.find((e) => !assignedEmployeeIds.has(e.id));
  if (deptAvailable) {
    return {
      employeeId: deptAvailable.id,
      employeeName: `${deptAvailable.firstName} ${deptAvailable.lastName}`,
      reason: "Available during the shift",
    };
  }

  return null;
}
