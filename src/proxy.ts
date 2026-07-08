import { NextResponse, type NextRequest } from "next/server";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import type { AppJwtPayload } from "@/lib/auth";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { pathnameAllowedForDepartmentKey } from "@/lib/department-nav";
import { resolveActiveDepartmentForNav } from "@/lib/active-department-context";
import { DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
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
  "/api/auth/active-department",
  "/api/auth/device-facility",
  "/api/billing/webhook",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function resolveLockedUnitId(session: AppJwtPayload, deviceUnitId: string | undefined): string | undefined {
  if (
    session.authKind === "employee" &&
    typeof deviceUnitId === "string" &&
    deviceUnitId.length > 0 &&
    session.activeUnitId === deviceUnitId
  ) {
    return deviceUnitId;
  }
  return undefined;
}

function defaultHomeRedirect(request: NextRequest, session: AppJwtPayload, lockedUnitId?: string) {
  const path = resolveDefaultHomePath({
    authKind: session.authKind ?? "user",
    role: session.role as AppRole,
    activeUnitId: session.activeUnitId,
    lockedUnitId,
  });
  return NextResponse.redirect(new URL(path, request.url));
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
    const sessionRaw = await verifySessionToken(token);
    const session = sessionRaw as AppJwtPayload;
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

    const role = session.role as AppRole;
    const isFa = isFacilityAdministratorRole(role);
    const deviceUnitId = request.cookies.get(DEVICE_UNIT_COOKIE)?.value;
    const lockedUnitId = resolveLockedUnitId(session, deviceUnitId);

    if (!onboardingComplete && isFa && !onSetupRoute) {
      return NextResponse.redirect(new URL(ONBOARDING_ENTRY_PATH, request.url));
    }
    if (onboardingComplete && pathname === ONBOARDING_ENTRY_PATH) {
      return defaultHomeRedirect(request, session, lockedUnitId);
    }

    if (pathname === "/settings" || pathname.startsWith("/settings/")) {
      if (hasAtLeastRole(role, "FACILITY_ADMINISTRATOR")) {
        return NextResponse.redirect(new URL("/admin/organization", request.url));
      }
      return defaultHomeRedirect(request, session, lockedUnitId);
    }
    if (!(await canAccessRouteByRole(pathname, role))) {
      return defaultHomeRedirect(request, session, lockedUnitId);
    }

    const deptCtx = await resolveActiveDepartmentForNav(request, session);
    if (!deptCtx.showAllDepartmentNav) {
      const key = deptCtx.activeOperationalDepartmentKey;
      if (!pathnameAllowedForDepartmentKey(pathname, key)) {
        return defaultHomeRedirect(request, session, lockedUnitId);
      }
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
