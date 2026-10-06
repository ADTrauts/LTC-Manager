/** Assigned-technician recognition for PIN employees and password-login Users. */
export function isAssignedWorkOrderTechnician(input: {
  assignedEmployeeId: string | null | undefined;
  operationalEmployeeId: string | null | undefined;
  sessionUid: string | null | undefined;
  authKind?: string | null;
}): boolean {
  if (!input.assignedEmployeeId) return false;
  if (input.operationalEmployeeId && input.assignedEmployeeId === input.operationalEmployeeId) {
    return true;
  }
  return input.authKind === "employee" && input.assignedEmployeeId === input.sessionUid;
}
