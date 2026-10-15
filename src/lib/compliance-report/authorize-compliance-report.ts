/**
 * Export scope matches Review: the signed-in facility, and a department that
 * facility actually owns. Department members stay inside their departments.
 * Facility administrators may request every department in the facility.
 */

export function complianceReportAccessDecision(input: {
  sessionFacilityId: string;
  requestedDepartmentId: string;
  facilityDepartmentIds: readonly string[];
  memberDepartmentIds: readonly string[] | "ALL";
}): { ok: true; departmentIds: string[] } | { ok: false; status: 403 | 400; message: string } {
  if (!input.sessionFacilityId.trim()) {
    return { ok: false, status: 403, message: "Sign in required." };
  }
  const owned = new Set(input.facilityDepartmentIds);
  const all = input.requestedDepartmentId === "all" || input.requestedDepartmentId === "";
  if (all) {
    if (input.memberDepartmentIds !== "ALL") {
      return { ok: false, status: 403, message: "Choose a department you can review." };
    }
    return { ok: true, departmentIds: [...owned] };
  }
  if (!owned.has(input.requestedDepartmentId)) {
    return { ok: false, status: 403, message: "That department is not in this facility." };
  }
  if (input.memberDepartmentIds !== "ALL" && !input.memberDepartmentIds.includes(input.requestedDepartmentId)) {
    return { ok: false, status: 403, message: "You cannot export this department." };
  }
  return { ok: true, departmentIds: [input.requestedDepartmentId] };
}
