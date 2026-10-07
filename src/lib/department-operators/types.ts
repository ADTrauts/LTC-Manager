/**
 * Department operating Organization — governance metadata only.
 * Does not grant facility authorization or change operational tenancy.
 */

export type DepartmentOperatingModel = "FACILITY_OPERATED" | "CONTRACTED";

export type DepartmentOperatorOrganizationSummary = {
  id: string;
  name: string;
  displayName: string | null;
  legalName: string | null;
  organizationType: string | null;
  isActive: boolean;
};

export type DepartmentOperatorRelationshipView = {
  id: string;
  departmentId: string;
  organizationId: string;
  organization: DepartmentOperatorOrganizationSummary;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  notes: string | null;
  externalAccountCode: string | null;
  contractReference: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DepartmentOperatorCurrentView = {
  relationship: DepartmentOperatorRelationshipView;
  operatingModel: DepartmentOperatingModel;
  facilityOrganizationId: string;
};

export class DepartmentOperatorError extends Error {
  readonly code:
    | "DEPARTMENT_NOT_FOUND"
    | "ORGANIZATION_NOT_FOUND"
    | "ORGANIZATION_INACTIVE"
    | "OVERLAPPING_PERIOD"
    | "INVALID_EFFECTIVE_DATE"
    | "NOT_FUTURE_CHANGE"
    | "UNAUTHORIZED"
    | "INVALID_INPUT";

  constructor(
    code: DepartmentOperatorError["code"],
    message: string,
  ) {
    super(message);
    this.name = "DepartmentOperatorError";
    this.code = code;
  }
}

export function deriveOperatingModel(input: {
  operatorOrganizationId: string;
  facilityOrganizationId: string;
}): DepartmentOperatingModel {
  return input.operatorOrganizationId === input.facilityOrganizationId
    ? "FACILITY_OPERATED"
    : "CONTRACTED";
}

export function operatingModelLabel(model: DepartmentOperatingModel): string {
  return model === "FACILITY_OPERATED" ? "Facility operated" : "Contracted";
}

export function organizationDisplayLabel(
  organization: Pick<DepartmentOperatorOrganizationSummary, "name" | "displayName">,
): string {
  const display = organization.displayName?.trim();
  if (display) return display;
  return organization.name;
}
