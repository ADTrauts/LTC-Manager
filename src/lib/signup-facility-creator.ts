import { RoleKey } from "@prisma/client";

import type { AppRole } from "@/lib/access";

/**
 * Platform authorization assigned to the User who creates a new Facility
 * through public signup. Session JWT copies this role immediately.
 *
 * This is not an onboarding bypass. Setup and billing still require
 * FACILITY_ADMINISTRATOR through the normal helpers.
 */
export const INITIAL_FACILITY_CREATOR_USER_ROLE = "FACILITY_ADMINISTRATOR" as const satisfies AppRole;

/**
 * Roster identity for that same person.
 *
 * Hub accounts (email User + matching Employee) pair FA/GM User roles to the
 * same RoleKey on Employee. JobTitle remains the separate display title.
 * Department.headEmployeeId is a different operational assignment and does
 * not grant purchase authority.
 */
export const INITIAL_FACILITY_CREATOR_EMPLOYEE_ROLE = RoleKey.FACILITY_ADMINISTRATOR;

export function initialFacilityCreatorRoles(): {
  userRoleKey: typeof INITIAL_FACILITY_CREATOR_USER_ROLE;
  employeeRoleType: typeof INITIAL_FACILITY_CREATOR_EMPLOYEE_ROLE;
} {
  return {
    userRoleKey: INITIAL_FACILITY_CREATOR_USER_ROLE,
    employeeRoleType: INITIAL_FACILITY_CREATOR_EMPLOYEE_ROLE,
  };
}

export function isFacilityCreatorUserRole(role: AppRole): boolean {
  return role === INITIAL_FACILITY_CREATOR_USER_ROLE;
}
