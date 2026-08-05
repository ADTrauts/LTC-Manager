import type { EmployeeStatus, RoleKey } from "@prisma/client";

/**
 * Why a change ended existing sessions. Recorded in the audit trail so an operator can see that an
 * authority change also signed the person out, without any token or credential value being stored.
 */
export type RevocationReason =
  | "PASSWORD_CHANGED"
  | "PIN_CHANGED"
  | "PIN_REMOVED"
  | "ROLE_CHANGED"
  | "EMPLOYEE_TERMINATED"
  | "USER_DEACTIVATED"
  | "FACILITY_ACCESS_REVOKED"
  | "DEPARTMENT_MEMBERSHIP_REMOVED"
  | "EXPLICIT_REVOKE";

/** Human-readable audit text. Never includes a credential, token, or cookie value. */
export function describeRevocation(reason: RevocationReason): string {
  switch (reason) {
    case "PASSWORD_CHANGED":
      return "Existing sessions ended: password changed.";
    case "PIN_CHANGED":
      return "Existing sessions ended: Quick PIN changed.";
    case "PIN_REMOVED":
      return "Existing sessions ended: Quick PIN removed.";
    case "ROLE_CHANGED":
      return "Existing sessions ended: role changed.";
    case "EMPLOYEE_TERMINATED":
      return "Existing sessions ended: employment terminated.";
    case "USER_DEACTIVATED":
      return "Existing sessions ended: account deactivated.";
    case "FACILITY_ACCESS_REVOKED":
      return "Existing sessions ended: facility access revoked.";
    case "DEPARTMENT_MEMBERSHIP_REMOVED":
      return "Existing sessions ended: department membership removed.";
    case "EXPLICIT_REVOKE":
      return "Existing sessions ended: sessions revoked.";
  }
}

export type EmployeeAuthoritySnapshot = {
  roleType: RoleKey;
  status: EmployeeStatus;
  /** Whether a Quick PIN is set. The digest itself is never compared or carried here. */
  hasPin: boolean;
};

/**
 * Decide whether an employee edit invalidates existing PIN sessions.
 *
 * Kept pure and separate from the actions so the policy can be read in one place and tested across
 * every combination without a database. Returns every applicable reason, because one form
 * submission can change several things at once and the audit trail should say so.
 */
export function employeeRevocationReasons(
  before: EmployeeAuthoritySnapshot,
  after: EmployeeAuthoritySnapshot,
): RevocationReason[] {
  const reasons: RevocationReason[] = [];

  if (before.roleType !== after.roleType) {
    reasons.push("ROLE_CHANGED");
  }
  // Only separation ends a session. `OFF` means off-shift, and Phase 3 established that an employee
  // covering an unscheduled shift keeps their operational authority; signing them out here would
  // create the opposite defect.
  if (before.status !== "TERMINATED" && after.status === "TERMINATED") {
    reasons.push("EMPLOYEE_TERMINATED");
  }
  if (before.hasPin && !after.hasPin) {
    reasons.push("PIN_REMOVED");
  }

  return reasons;
}

export type UserAuthoritySnapshot = {
  roleId: string;
  isActive: boolean;
};

/** Decide whether a user edit invalidates existing password sessions. */
export function userRevocationReasons(
  before: UserAuthoritySnapshot,
  after: UserAuthoritySnapshot,
): RevocationReason[] {
  const reasons: RevocationReason[] = [];

  if (before.roleId !== after.roleId) {
    reasons.push("ROLE_CHANGED");
  }
  if (before.isActive && !after.isActive) {
    reasons.push("USER_DEACTIVATED");
  }

  return reasons;
}

/**
 * Changes that deliberately do NOT end a session.
 *
 * Listed explicitly rather than left implicit so the boundary is reviewable: signing people out is
 * disruptive on a shared tablet mid-shift, and doing it for a corrected phone number would train
 * operators to expect spurious sign-outs.
 */
export const NON_REVOKING_CHANGES = [
  "displayName",
  "firstName",
  "lastName",
  "phone",
  "email",
  "employmentType",
  "jobTitleId",
  "hireDate",
  "birthMonth",
  "birthDay",
  "shirtSize",
  "hrNotes",
  "unionMember",
  "onLeave",
  "primaryUnitId",
  "workStations",
  "defaultAssignment",
  "disciplinePoints",
  // `OFF` and returns from `OFF` continue to mean off-shift rather than deactivated.
  "status:OFF",
] as const;
