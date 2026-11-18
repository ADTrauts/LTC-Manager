export type FacilityProvisioningCode =
  | "INVALID_INPUT"
  | "ORGANIZATION_NOT_FOUND"
  | "ORGANIZATION_INACTIVE"
  | "ROLE_MISSING"
  | "INVALID_TIMEZONE"
  | "DUPLICATE_NAME"
  | "ORGANIZATION_NAME_MATCH"
  | "USER_INACTIVE"
  | "FORBIDDEN";

export class FacilityProvisioningError extends Error {
  constructor(
    readonly code: FacilityProvisioningCode,
    message: string,
  ) {
    super(message);
    this.name = "FacilityProvisioningError";
  }
}
