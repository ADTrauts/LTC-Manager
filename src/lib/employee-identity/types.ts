export class EmployeeIdentityError extends Error {
  constructor(
    readonly code:
      | "ACCESS_DENIED"
      | "ALREADY_LINKED"
      | "AMBIGUOUS"
      | "AUTH_REQUIRED"
      | "CONFLICT"
      | "CROSS_ORGANIZATION"
      | "EMPLOYEE_INACTIVE"
      | "EMPLOYEE_NOT_FOUND"
      | "INVITATION_INVALID"
      | "USER_INACTIVE"
      | "WRONG_USER",
    message: string,
  ) {
    super(message);
    this.name = "EmployeeIdentityError";
  }
}

export type EmployeeAccountLinkState = "linked" | "pending" | "none";
