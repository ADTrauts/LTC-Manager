import { applyAccountSessionCookies, applyContextTransitionCookies, type CookieWriter } from "@/lib/context-entry/cookies";

import type { AuthenticatedUserLanding } from "./types";

export function applyAuthenticatedUserLandingCookies(
  jar: CookieWriter,
  landing: AuthenticatedUserLanding,
): void {
  if (landing.kind === "account") {
    applyAccountSessionCookies(jar, landing.token);
    return;
  }
  applyContextTransitionCookies(jar, {
    kind: landing.destinationKind,
    token: landing.token,
    facilityId: landing.facilityId,
    facilityPartnerOrganizationId: landing.facilityPartnerOrganizationId,
    allowedDepartmentIds: landing.allowedDepartmentIds,
  });
}
