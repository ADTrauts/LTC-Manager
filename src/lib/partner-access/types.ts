/**
 * Facility partner governance (Phase 2A).
 *
 * Partner relationship + Department scope DO NOT grant any user Facility access.
 * UserFacilityAccess remains the internal same-parent-org path only.
 */

export type FacilityPartnerLifecycleState =
  | "PENDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "ENDED";

export type PartnerOrganizationSummary = {
  id: string;
  name: string;
  displayName: string | null;
  legalName: string | null;
  organizationType: string | null;
  isActive: boolean;
};

export type FacilityPartnerAccessPeriodView = {
  id: string;
  facilityPartnerOrganizationId: string;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FacilityPartnerDepartmentScopeView = {
  id: string;
  facilityPartnerOrganizationId: string;
  departmentId: string;
  departmentName: string;
  departmentKey: string;
  startsAt: Date;
  endsAt: Date | null;
  createdByUserId: string | null;
  endedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FacilityPartnerView = {
  id: string;
  facilityId: string;
  organizationId: string;
  organization: PartnerOrganizationSummary;
  notes: string | null;
  createdByUserId: string | null;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  endedByUserId: string | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lifecycleState: FacilityPartnerLifecycleState;
  currentAccessPeriod: FacilityPartnerAccessPeriodView | null;
  currentDepartmentScopes: FacilityPartnerDepartmentScopeView[];
  accessPeriods: FacilityPartnerAccessPeriodView[];
  /** Full Department scope history (closed + open). */
  departmentScopes: FacilityPartnerDepartmentScopeView[];
};

export class FacilityPartnerError extends Error {
  readonly code:
    | "FACILITY_NOT_FOUND"
    | "ORGANIZATION_NOT_FOUND"
    | "ORGANIZATION_INACTIVE"
    | "PARENT_ORGANIZATION_REJECTED"
    | "PARTNERSHIP_NOT_FOUND"
    | "PARTNERSHIP_ENDED"
    | "PARTNERSHIP_EXISTS"
    | "OVERLAPPING_PERIOD"
    | "NO_ACTIVE_PERIOD"
    | "DEPARTMENT_NOT_FOUND"
    | "SCOPE_ALREADY_ACTIVE"
    | "SCOPE_NOT_ACTIVE"
    | "INVALID_INPUT";

  constructor(code: FacilityPartnerError["code"], message: string) {
    super(message);
    this.name = "FacilityPartnerError";
    this.code = code;
  }
}

export function partnerOrganizationLabel(
  organization: Pick<PartnerOrganizationSummary, "name" | "displayName">,
): string {
  const display = organization.displayName?.trim();
  if (display) return display;
  return organization.name;
}

export function lifecycleStateLabel(state: FacilityPartnerLifecycleState): string {
  switch (state) {
    case "ACTIVE":
      return "Active";
    case "SUSPENDED":
      return "Suspended";
    case "ENDED":
      return "Ended";
    case "PENDING":
      return "Pending activation";
  }
}
