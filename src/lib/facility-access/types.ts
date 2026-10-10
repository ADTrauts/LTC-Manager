import type { AppRole } from "@/lib/access";

export type AccessibleFacility = {
  facilityId: string;
  facilityName: string;
  organizationId: string;
  organizationName: string;
  /** Current internal RoleKey for this Facility grant. */
  role: AppRole;
};

export type FacilityAccessContext = {
  organizationId: string;
  organizationName: string;
  activeFacilityId: string;
  activeFacilityName: string;
  accessibleFacilities: AccessibleFacility[];
};

export type OrganizationFacilitySummary = {
  facilityId: string;
  facilityName: string;
  organizationId: string;
  organizationName: string;
  timezone: string;
  onboardingCompleted: boolean;
  onboardingCurrentStep: string | null;
  activeAccessCount: number;
  /** True when the viewing user has an active grant for this facility. */
  viewerHasAccess: boolean;
};
