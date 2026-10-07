/**
 * Organization helpers (Wave 11 M1).
 *
 * Facility remains the session/data isolation root. Organization is a parent
 * grouping layer only — helpers never grant sibling-facility access.
 *
 * Parent Organization ≠ Department operating Organization. Contracted department
 * operation is DepartmentOperatorRelationship (governance metadata only).
 *
 * managementCompanyName on Facility is legacy and retained for compatibility.
 * Do not dual-write it from Organization fields. Do not treat it as Department
 * operator identity. Future deprecation: remove after callers stop reading it.
 */
export type {
  OrganizationContext,
  OrganizationTypeValue,
} from "./types";
export {
  ORGANIZATION_TYPES,
  ORGANIZATION_TYPE_OPTIONS,
  isOrganizationType,
  normalizeOrganizationKey,
  organizationTypeLabel,
  resolveOrganizationCreateName,
} from "./types";
export {
  loadOrganizationContext,
  loadOrganizationContextForSessionFacility,
} from "./load-organization-context";
export {
  assertOrganizationBelongsToFacilitySession,
  assertSameFacilityScope,
  canEditOrganizationSettings,
  canReassignFacilityOrganization,
} from "./organization-access";
export { createOrganizationForNewFacility } from "./create-organization";
