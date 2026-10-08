import { NextResponse, type NextRequest } from "next/server";

import { getCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { completePartnerFacilityTransition } from "@/lib/partner-facility-session";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

/**
 * Recovers a partner Facility cookie that no longer authorizes entry.
 * The Organization id comes only from the signed token. Query parameters are ignored.
 */
export async function GET(request: NextRequest) {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  const login = NextResponse.redirect(new URL("/login", request.url));
  login.cookies.set(SESSION_COOKIE, "", { ...getCookieOptions(), maxAge: 0 });
  if (!raw) return login;

  const transition = await completePartnerFacilityTransition(prisma, {
    token: raw,
    requestedOrganizationId: request.nextUrl.searchParams.get("organizationId"),
  });
  if (transition.outcome === "clear") {
    await trackEvent("partner_session.invalidated", {
      restoredOrganizationSession: false,
      reason: transition.reason,
    });
    return login;
  }

  const home = NextResponse.redirect(new URL(`/organization/${transition.organizationId}`, request.url));
  home.cookies.set(SESSION_COOKIE, transition.token, getCookieOptions());
  await trackEvent("partner_session.invalidated", {
    partnerOrganizationId: transition.organizationId,
    restoredOrganizationSession: true,
  });
  return home;
}
