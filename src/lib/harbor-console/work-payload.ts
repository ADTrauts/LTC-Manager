import type { AppJwtPayload } from "@/lib/auth";
import type { HarborJwtPayload } from "@/lib/harbor-console/session";

/** Facility-scoped JWT claims for allowlisted builder routes. uid stays PlatformStaff. */
export function composeHarborWorkAppSession(
  harbor: HarborJwtPayload,
  facilityId: string,
): AppJwtPayload {
  return {
    uid: harbor.uid,
    authKind: "harbor_staff",
    authMethod: "PASSWORD",
    role: "FACILITY_ADMINISTRATOR",
    name: harbor.name,
    email: harbor.email,
    facilityId,
    sessionVersion: harbor.sessionVersion,
  };
}

export function isHarborStaffSession(session: { authKind?: string | null }): boolean {
  return session.authKind === "harbor_staff";
}
