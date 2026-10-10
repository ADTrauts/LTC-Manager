import { NextResponse, type NextRequest } from "next/server";

import type { AppRole } from "@/lib/access";
import type { AppJwtPayload } from "@/lib/auth";
import {
  createAccountSessionToken,
  createSessionToken,
  getCookieOptions,
  isAccountSession,
  isFacilityScopedSession,
  isPartnerFacilitySession,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/auth";
import { applyAccountSessionCookies } from "@/lib/context-entry";
import { pathnameAllowedForDepartmentKey } from "@/lib/department-nav";
import { resolveActiveDepartmentForNav } from "@/lib/active-department-context";
import { DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import {
  internalRoleKeyAsAppRole,
  resolveCurrentInternalFacilityRole,
} from "@/lib/facility-access/internal-facility-role";
import { isCanonicalLogsEnabled, isTodaysWorkEnabled } from "@/lib/feature-flags";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { ONBOARDING_ENTRY_PATH } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { authorizeHarborRequest, authorizeHarborWorkFacilityRequest } from "@/lib/harbor-console/proxy-gate";
import { authorizeRoute, isApiPathname, type RouteAuthorizationDecision } from "@/lib/route-registry";
import {
  classifySessionRejection,
  validateSessionAuthority,
  type SessionRejection,
} from "@/lib/session-revocation";

function routeFeatureFlags() {
  return {
    todaysWorkEnabled: isTodaysWorkEnabled(),
    // Fail closed when omitted elsewhere — do not treat absent as enabled for Canonical Logs.
    canonicalLogsEnabled: isCanonicalLogsEnabled(),
  };
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
  if (session.scopeKind === "account") {
    return "/access";
  }
  if (session.scopeKind === "organization" && session.organizationId) {
    return `/organization/${session.organizationId}`;
  }
  return resolveDefaultHomePath({
    authKind: session.authKind ?? "user",
    role: (session.role ?? "STAFF") as AppRole,
    activeUnitId: session.activeUnitId,
    lockedUnitId,
  });
}

function identityFailureResponse(request: NextRequest, surface: "PAGE" | "API" | "INTERNAL") {
  const response = unauthenticatedResponse(request, surface);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

async function recoverInvalidUserContext(
  request: NextRequest,
  session: AppJwtPayload,
  reason: SessionRejection,
): Promise<NextResponse> {
  const surface = isApiPathname(request.nextUrl.pathname) ? "API" : "PAGE";

  if (session.authKind !== "user" || classifySessionRejection(reason) === "identity") {
    return identityFailureResponse(request, surface);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: {
      id: true,
      isActive: true,
      sessionVersion: true,
      displayName: true,
      email: true,
    },
  });
  if (
    !user?.isActive ||
    !user.email ||
    typeof session.sessionVersion !== "number" ||
    user.sessionVersion !== session.sessionVersion
  ) {
    return identityFailureResponse(request, surface);
  }

  const token = await createAccountSessionToken({
    uid: user.id,
    name: user.displayName,
    email: user.email,
    sessionVersion: user.sessionVersion,
  });
  const response =
    surface === "API"
      ? NextResponse.json({ error: "Forbidden." }, { status: 403 })
      : NextResponse.redirect(new URL("/access", request.url));
  applyAccountSessionCookies(response.cookies, token);
  return response;
}

async function remintStaleInternalRole(
  session: AppJwtPayload,
): Promise<{ token: string; role: AppRole } | null> {
  if (!isFacilityScopedSession(session) || session.authKind !== "user") {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: {
      id: true,
      isActive: true,
      sessionVersion: true,
      displayName: true,
      email: true,
    },
  });
  if (
    !user?.isActive ||
    !user.email ||
    typeof session.sessionVersion !== "number" ||
    user.sessionVersion !== session.sessionVersion
  ) {
    return null;
  }
  const resolved = await resolveCurrentInternalFacilityRole(prisma, {
    userId: user.id,
    facilityId: session.facilityId,
  });
  if (!resolved) {
    return null;
  }
  const role = internalRoleKeyAsAppRole(resolved.roleKey);
  const token = await createSessionToken({
    uid: user.id,
    authKind: "user",
    role,
    name: user.displayName,
    email: user.email,
    facilityId: session.facilityId,
    activeUnitId: session.activeUnitId,
    primaryDepartmentId: session.primaryDepartmentId,
    sessionVersion: user.sessionVersion,
  });
  return { token, role };
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

async function continueFacilityRequest(
  request: NextRequest,
  session: AppJwtPayload,
  featureFlags: ReturnType<typeof routeFeatureFlags>,
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId! },
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

  if (!onboardingComplete && isFa && session.authKind !== "harbor_staff" && !onSetupRoute) {
    return NextResponse.redirect(new URL(ONBOARDING_ENTRY_PATH, request.url));
  }
  if (onboardingComplete && pathname === ONBOARDING_ENTRY_PATH) {
    return defaultHomeRedirect(request, session, lockedUnitId);
  }

  const decision = authorizeRoute({
    pathname,
    role,
    sessionScope: "facility",
    authKind: session.authKind,
    featureFlags,
  });
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

  if (anonymousDecision.route.access.kind === "HARBOR_STAFF") {
    const harborDenial = await authorizeHarborRequest(request);
    if (harborDenial) {
      return harborDenial;
    }
    return NextResponse.next();
  }

  const workDecision = await authorizeHarborWorkFacilityRequest(request);
  if (workDecision !== "fallthrough") {
    return workDecision;
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return unauthenticatedResponse(request, isApiPathname(pathname) ? "API" : "PAGE");
  }

  try {
    const sessionRaw = await verifySessionToken(token);
    const session = sessionRaw as AppJwtPayload;
    if (session.scopeKind === "facility" && !session.facilityId && !isAccountSession(session)) {
      const response = unauthenticatedResponse(request, isApiPathname(pathname) ? "API" : "PAGE");
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    if (session.scopeKind === "organization" && !session.organizationId) {
      const response = unauthenticatedResponse(request, isApiPathname(pathname) ? "API" : "PAGE");
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }

    // A valid signature proves the server issued this session, not that the holder still has the
    // authority it was issued under. Termination, a role change, or a password reset must take
    // effect now rather than when the token happens to expire.
    const authority = await validateSessionAuthority(session, prisma);
    if (!authority.valid) {
      if (
        authority.reason === "ROLE_STALE" &&
        session.authKind === "user" &&
        isFacilityScopedSession(session)
      ) {
        const reminted = await remintStaleInternalRole(session);
        if (reminted) {
          session.role = reminted.role;
          const continued = await continueFacilityRequest(request, session, featureFlags);
          continued.cookies.set(SESSION_COOKIE, reminted.token, getCookieOptions());
          return continued;
        }
      }
      return recoverInvalidUserContext(request, session, authority.reason);
    }
    // Department authority the identity no longer holds is dropped before it can reach nav scoping.
    session.primaryDepartmentId = authority.effectiveDepartmentId ?? undefined;

    if (isPartnerFacilitySession(session)) {
      const decision = authorizeRoute({
        pathname,
        role: null,
        sessionScope: "partner",
        authKind: "user",
        featureFlags,
      });
      if (decision.outcome === "ALLOW") {
        return NextResponse.next();
      }
      if (decision.outcome === "NOT_FOUND") {
        return notFoundResponse(decision.surface);
      }
      if ("surface" in decision && decision.surface === "API") {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/partner", request.url));
    }

    if (session.scopeKind === "account") {
      const decision = authorizeRoute({
        pathname,
        role: null,
        sessionScope: "account",
        authKind: "user",
        featureFlags,
      });
      const denial = respondToDecision(request, decision, session);
      if (denial) {
        return denial;
      }
      return NextResponse.next();
    }

    if (session.scopeKind === "organization") {
      const decision = authorizeRoute({
        pathname,
        role: null,
        sessionScope: "organization",
        authKind: session.authKind,
        featureFlags,
      });
      const denial = respondToDecision(request, decision, session);
      if (denial) {
        return denial;
      }
      return NextResponse.next();
    }

    return continueFacilityRequest(request, session, featureFlags);
  } catch (error) {
    // JWT/session failures → sign-in. Infrastructure failures (e.g. Prisma) must not
    // clear the session cookie or Next server actions get an HTML /login response.
    const message = error instanceof Error ? error.message : String(error);
    const looksLikeInfra =
      message.includes("Prisma") ||
      message.includes("prisma") ||
      message.includes("Can't reach database") ||
      message.includes("Service temporarily unavailable") ||
      message.includes("Prisma Client is stale");
    if (looksLikeInfra) {
      console.error("[proxy] infrastructure error on", pathname, error);
      return new NextResponse("Service temporarily unavailable.", { status: 503 });
    }
    const response = unauthenticatedResponse(request, isApiPathname(pathname) ? "API" : "PAGE");
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
