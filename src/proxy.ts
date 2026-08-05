import { NextResponse, type NextRequest } from "next/server";

import type { AppRole } from "@/lib/access";
import type { AppJwtPayload } from "@/lib/auth";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { pathnameAllowedForDepartmentKey } from "@/lib/department-nav";
import { resolveActiveDepartmentForNav } from "@/lib/active-department-context";
import { DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { isTodaysWorkEnabled } from "@/lib/feature-flags";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { ONBOARDING_ENTRY_PATH } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { authorizeRoute, isApiPathname, type RouteAuthorizationDecision } from "@/lib/route-registry";
import { validateSessionAuthority } from "@/lib/session-revocation";

function routeFeatureFlags() {
  return { todaysWorkEnabled: isTodaysWorkEnabled() };
}

function notFoundResponse(surface: "PAGE" | "API" | "INTERNAL") {
  if (surface === "API") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return new NextResponse(null, { status: 404 });
}

function unauthenticatedResponse(request: NextRequest, surface: "PAGE" | "API" | "INTERNAL") {
  if (surface === "API") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
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

function defaultHomePath(session: AppJwtPayload, lockedUnitId?: string) {
  return resolveDefaultHomePath({
    authKind: session.authKind ?? "user",
    role: session.role as AppRole,
    activeUnitId: session.activeUnitId,
    lockedUnitId,
  });
}

function defaultHomeRedirect(request: NextRequest, session: AppJwtPayload, lockedUnitId?: string) {
  return NextResponse.redirect(new URL(defaultHomePath(session, lockedUnitId), request.url));
}

/**
 * Turn a platform-registry decision into an HTTP response.
 *
 * Pages keep the product's established behavior — sign-in for no session, the caller's own home for
 * a denial — so a denied link never dead-ends. APIs get status codes instead of redirects, because a
 * redirect into a page is not a usable answer to a fetch and hides the denial from the caller.
 */
function respondToDecision(
  request: NextRequest,
  decision: RouteAuthorizationDecision,
  session: AppJwtPayload,
  lockedUnitId?: string,
): NextResponse | null {
  switch (decision.outcome) {
    case "ALLOW":
      return null;
    case "NOT_FOUND":
      return notFoundResponse(decision.surface);
    case "REQUIRE_AUTHENTICATION":
      return unauthenticatedResponse(request, decision.surface);
    case "DENY":
      return decision.surface === "API"
        ? NextResponse.json({ error: "Forbidden." }, { status: 403 })
        : defaultHomeRedirect(request, session, lockedUnitId);
    case "REDIRECT":
      return NextResponse.redirect(
        new URL(decision.destination ?? defaultHomePath(session, lockedUnitId), request.url),
      );
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const featureFlags = routeFeatureFlags();

  // Resolve the path against the registry before touching the session, so unregistered paths and
  // public routes never depend on cookie or database state.
  const anonymousDecision = authorizeRoute({ pathname, role: null, featureFlags });
  if (anonymousDecision.outcome === "ALLOW") {
    return NextResponse.next();
  }
  if (anonymousDecision.outcome === "NOT_FOUND") {
    return notFoundResponse(anonymousDecision.surface);
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return unauthenticatedResponse(request, isApiPathname(pathname) ? "API" : "PAGE");
  }

  try {
    const sessionRaw = await verifySessionToken(token);
    const session = sessionRaw as AppJwtPayload;
    if (!session.facilityId) {
      const response = unauthenticatedResponse(request, isApiPathname(pathname) ? "API" : "PAGE");
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }

    // A valid signature proves the server issued this session, not that the holder still has the
    // authority it was issued under. Termination, a role change, or a password reset must take
    // effect now rather than when the token happens to expire.
    const authority = await validateSessionAuthority(session, prisma);
    if (!authority.valid) {
      const response = unauthenticatedResponse(request, isApiPathname(pathname) ? "API" : "PAGE");
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    // Department authority the identity no longer holds is dropped before it can reach nav scoping.
    session.primaryDepartmentId = authority.effectiveDepartmentId ?? undefined;

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

    const decision = authorizeRoute({ pathname, role, featureFlags });
    const denial = respondToDecision(request, decision, session, lockedUnitId);
    if (denial) {
      return denial;
    }

    const deptCtx = await resolveActiveDepartmentForNav(request, session);
    if (!deptCtx.showAllDepartmentNav) {
      const key = deptCtx.activeOperationalDepartmentKey;
      if (!pathnameAllowedForDepartmentKey(pathname, key)) {
        return isApiPathname(pathname)
          ? NextResponse.json({ error: "Forbidden." }, { status: 403 })
          : defaultHomeRedirect(request, session, lockedUnitId);
      }
    }

    return NextResponse.next();
  } catch {
    const response = unauthenticatedResponse(request, isApiPathname(pathname) ? "API" : "PAGE");
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
