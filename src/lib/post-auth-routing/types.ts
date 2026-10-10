import type { AppRole } from "@/lib/access";
import type { ContextKeyKind } from "@/lib/context-entry";

export type RouteAuthenticatedUserInput = {
  userId: string;
  sessionVersion?: number;
  now?: Date;
};

export type AuthenticatedUserLanding =
  | {
      kind: "account";
      token: string;
      redirectPath: "/access";
      contextCount: number;
    }
  | {
      kind: "context";
      token: string;
      redirectPath: string;
      contextCount: 1;
      contextKey: string;
      destinationKind: ContextKeyKind;
      organizationId?: string;
      facilityId?: string;
      partnerOrganizationId?: string;
      facilityPartnerOrganizationId?: string;
      role?: AppRole;
      allowedDepartmentIds?: string[];
    };

export type PostAuthRoutingErrorCode =
  | "USER_NOT_FOUND"
  | "USER_INACTIVE"
  | "SESSION_VERSION_STALE";

export class PostAuthRoutingError extends Error {
  readonly code: PostAuthRoutingErrorCode;

  constructor(code: PostAuthRoutingErrorCode, message: string) {
    super(message);
    this.name = "PostAuthRoutingError";
    this.code = code;
  }
}
