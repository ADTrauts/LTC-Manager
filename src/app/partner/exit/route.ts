import { NextResponse, type NextRequest } from "next/server";

import {
  createOrganizationSessionToken,
  getCookieOptions,
  isPartnerFacilitySession,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/auth";
import { resolvePartnerFacilityExit } from "@/lib/partner-facility-session";
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

  let payload;
  try {
    payload = await verifySessionToken(raw);
  } catch {
    return login;
  }
  if (!isPartnerFacilitySession(payload)) return login;

  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, email: true, displayName: true, sessionVersion: true, isActive: true },
  });
  const exit = await resolvePartnerFacilityExit(prisma, payload);
  if (!user?.isActive || !user.email || user.sessionVersion !== payload.sessionVersion || exit.action === "login") {
    await trackEvent("partner_session.invalidated", {
      userId: payload.uid,
      facilityId: payload.facilityId,
      partnerOrganizationId: payload.partnerOrganizationId,
      facilityPartnerOrganizationId: payload.facilityPartnerOrganizationId,
      restoredOrganizationSession: false,
    });
    return login;
  }

  const token = await createOrganizationSessionToken({
    uid: user.id,
    authMethod: "PASSWORD",
    name: user.displayName,
    email: user.email,
    organizationId: exit.organizationId,
    sessionVersion: user.sessionVersion,
  });
  const home = NextResponse.redirect(new URL(`/organization/${exit.organizationId}`, request.url));
  home.cookies.set(SESSION_COOKIE, token, getCookieOptions());
  await trackEvent("partner_session.invalidated", {
    userId: user.id,
    facilityId: payload.facilityId,
    partnerOrganizationId: payload.partnerOrganizationId,
    facilityPartnerOrganizationId: payload.facilityPartnerOrganizationId,
    restoredOrganizationSession: true,
  });
  return home;
}
