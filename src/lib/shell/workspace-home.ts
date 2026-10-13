import {
  isAccountSession,
  isFacilityScopedSession,
  isOrganizationScopedSession,
  isPartnerFacilitySession,
  type AppJwtPayload,
} from "@/lib/auth";
import { resolveDefaultHomePath } from "@/lib/nav-zones";

/**
 * Home for the current Workspace. Identity pages and the Vssyl mark use this
 * instead of a hardcoded /workspace.
 */
export function resolveWorkspaceHomeHref(session: AppJwtPayload): string {
  if (isOrganizationScopedSession(session)) {
    return `/organization/${session.organizationId}`;
  }
  if (isPartnerFacilitySession(session)) {
    return "/partner";
  }
  if (isAccountSession(session)) {
    return "/access";
  }
  if (isFacilityScopedSession(session)) {
    return resolveDefaultHomePath({
      authKind: session.authKind,
      role: session.role,
      activeUnitId: session.activeUnitId,
    });
  }
  return "/access";
}

/** Visible return label on My Access / My Account. Null when there is no workspace to return to. */
export function workspaceHomeBackLabel(session: AppJwtPayload): string | null {
  if (isAccountSession(session)) return null;
  if (isOrganizationScopedSession(session)) return "Back to Portfolio";
  if (isPartnerFacilitySession(session) || isFacilityScopedSession(session)) {
    return "Back to Dashboard";
  }
  return null;
}
