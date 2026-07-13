/**
 * Explicit multi-facility access (Wave 11 M2).
 *
 * Organization groups facilities. Access grants authorize facilities.
 * Shared Organization membership alone never grants access.
 *
 * Session strategy on switch:
 * - Updates User.facilityId (active/home facility for this milestone)
 * - Re-issues JWT with the destination facilityId
 * - Updates device facility cookie
 * - Remaps or clears department cookie / primaryDepartmentId by department key
 *
 * Per-facility role on UserFacilityAccess is deferred; User.role remains authoritative.
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
