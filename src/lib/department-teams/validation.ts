import type { EmployeeStatus } from "@prisma/client";

export const TEAM_DISPLAY_NAME_MAX = 80;
export const TEAM_DESCRIPTION_MAX = 500;

export function normalizeTeamDisplayName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Team name is required.");
  if (trimmed.length > TEAM_DISPLAY_NAME_MAX) {
    throw new Error(`Team name must be ${TEAM_DISPLAY_NAME_MAX} characters or fewer.`);
  }
  return trimmed;
}

export function normalizeTeamDescription(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > TEAM_DESCRIPTION_MAX) {
    throw new Error(`Team description must be ${TEAM_DESCRIPTION_MAX} characters or fewer.`);
  }
  return trimmed;
}

export function teamNamesConflict(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type TeamRoomCatalogEntry = {
  spaceId: string;
  facilityId: string;
  isActive: boolean;
};

/**
 * Submitted Team Rooms must all be active UnitSpaces in the Department footprint.
 * Rejects the entire set if any id is missing, inactive, cross-facility, or not assigned.
 */
export function validateTeamRoomSubmission(input: {
  submittedSpaceIds: readonly string[];
  allowedSpaceIds: ReadonlySet<string>;
}): string[] {
  const unique = [...new Set(input.submittedSpaceIds.filter(Boolean))];
  if (unique.length !== input.submittedSpaceIds.filter(Boolean).length) {
    // Duplicates are harmless — unique set is what we persist.
  }
  const invalid = unique.filter((id) => !input.allowedSpaceIds.has(id));
  if (invalid.length === 0) return unique;
  throw new Error("Team locations must be Rooms assigned to this Department.");
}

export type TeamManagerCandidate = {
  id: string;
  facilityId: string;
  status: EmployeeStatus;
  primaryDepartmentId: string | null;
  membershipDepartmentIds: readonly string[];
};

/**
 * Team Manager validation.
 *
 * Canonical Department membership is primaryDepartmentId ∪ EmployeeDepartment.
 * Team Manager must belong to the Team's Department. Leadership is not inferred
 * from Team membership; belonging to the Department is sufficient.
 *
 * Does not inspect or mutate RoleKey.
 */
export function evaluateTeamManagerCandidate(
  employee: TeamManagerCandidate,
  input: { facilityId: string; departmentId: string },
): { ok: true } | { ok: false; reason: string } {
  if (employee.facilityId !== input.facilityId) {
    return { ok: false, reason: "Team Manager must belong to this facility." };
  }
  if (employee.status === "TERMINATED") {
    return { ok: false, reason: "Cannot assign a terminated employee as Team Manager." };
  }
  const known = new Set<string>();
  if (employee.primaryDepartmentId) known.add(employee.primaryDepartmentId);
  for (const id of employee.membershipDepartmentIds) known.add(id);
  if (!known.has(input.departmentId)) {
    return { ok: false, reason: "Team Manager must belong to this Department." };
  }
  return { ok: true };
}
