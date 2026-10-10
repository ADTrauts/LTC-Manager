import type { AppRole } from "@/lib/access";

export type ContextKeyKind = "organization" | "facility_internal" | "facility_partner";

export type ParsedContextKey =
  | { kind: "organization"; organizationId: string; contextKey: `organization:${string}` }
  | { kind: "facility_internal"; facilityId: string; contextKey: `facility_internal:${string}` }
  | {
      kind: "facility_partner";
      facilityPartnerOrganizationId: string;
      contextKey: `facility_partner:${string}`;
    };

export type EnterContextResult = {
  token: string;
  redirectPath: string;
  kind: ContextKeyKind;
  organizationId?: string;
  facilityId?: string;
  partnerOrganizationId?: string;
  facilityPartnerOrganizationId?: string;
  role?: AppRole;
  allowedDepartmentIds?: string[];
};

export type EnterAccountContextResult = {
  token: string;
  redirectPath: "/access";
  kind: "account";
};

export type ContextEntryErrorCode =
  | "INVALID_CONTEXT_KEY"
  | "CONTEXT_NOT_AVAILABLE"
  | "USER_NOT_FOUND"
  | "USER_INACTIVE"
  | "SESSION_VERSION_STALE";

export class ContextEntryError extends Error {
  readonly code: ContextEntryErrorCode;

  constructor(code: ContextEntryErrorCode, message: string) {
    super(message);
    this.name = "ContextEntryError";
    this.code = code;
  }
}
