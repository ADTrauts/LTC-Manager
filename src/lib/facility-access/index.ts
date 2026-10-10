/**
 * Explicit multi-facility access (Wave 11 M2).
 *
 * Organization groups facilities. Access grants authorize facilities.
 * Shared Organization membership alone never grants access.
 *
 * Session strategy on switch (Phase 2B1):
 * - Does NOT rewrite User.facilityId (home Facility affiliation)
 * - Re-issues JWT with the destination facilityId as active Facility
 * - Updates device facility cookie
 * - Remaps or clears department cookie by department key (session/cookie only)
 *
 * Internal RoleKey is historically effective on UserFacilityRolePeriod for the selected grant.
 * User.roleId is compatibility/home default only — not active Facility authority.
 * Organization membership never grants Facility access.
 */

export type {
  AccessibleFacility,
  FacilityAccessContext,
  OrganizationFacilitySummary,
} from "./types";

export {
  userHasActiveFacilityAccess,
  assertUserFacilityAccess,
  listActiveFacilityAccesses,
  ensureUserFacilityAccessGrant,
  grantUserFacilityAccess,
  revokeUserFacilityAccess,
  restoreUserFacilityAccess,
  canManageFacilityAccess,
} from "./assert-user-facility-access";

export { loadFacilityAccessContext } from "./load-user-facility-access";

export {
  resolveDepartmentCarryoverForFacilitySwitch,
  switchActiveFacility,
  type SwitchActiveFacilityResult,
} from "./switch-active-facility";

export { loadOrganizationFacilitySummaries } from "./organization-facility-summary";

export {
  changeInternalFacilityRole,
  ensureCurrentInternalFacilityRole,
  listCurrentInternalFacilityRoles,
  resolveCurrentInternalFacilityRole,
  type InternalFacilityRoleResolution,
} from "./internal-facility-role";
