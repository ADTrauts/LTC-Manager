import { NextResponse, type NextRequest } from "next/server";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { ONBOARDING_ENTRY_PATH } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { canAccessRouteByRole } from "@/lib/route-permissions";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/setup",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/auth/pin-login",
  "/api/auth/device-facility",
  "/api/billing/webhook",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const session = await verifySessionToken(token);
    if (!session.facilityId) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }

    const facility = await prisma.facility.findUnique({
      where: { id: session.facilityId },
      select: { onboardingCompletedAt: true },
    });
    const onboardingComplete = Boolean(facility?.onboardingCompletedAt);
    const onSetupRoute =
      pathname === ONBOARDING_ENTRY_PATH ||
      pathname.startsWith(`${ONBOARDING_ENTRY_PATH}/`) ||
      pathname.startsWith("/api/onboarding") ||
      pathname.startsWith("/api/billing");

    if (!onboardingComplete && session.role === "GM" && !onSetupRoute) {
      return NextResponse.redirect(new URL(ONBOARDING_ENTRY_PATH, request.url));
    }
    if (onboardingComplete && pathname === ONBOARDING_ENTRY_PATH) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    const role = session.role as AppRole;
    if (pathname === "/settings" || pathname.startsWith("/settings/")) {
      if (hasAtLeastRole(role, "GM")) {
        return NextResponse.redirect(new URL("/admin/organization", request.url));
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (!(await canAccessRouteByRole(pathname, role))) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  } catch {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
