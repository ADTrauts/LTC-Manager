import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  applyContextTransitionCookies,
  ContextEntryError,
  enterContext,
} from "@/lib/context-entry";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/department-nav";
import { resolveDepartmentCarryoverForFacilitySwitch } from "@/lib/facility-access/switch-active-facility";
import { PARTNER_ACTIVE_DEPARTMENT_COOKIE } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";
import { readAuthenticatedUserIdentity } from "@/lib/user-session";

function redirectTo(request: NextRequest, path: string) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const [pathname, search = ""] = path.split("?");
  const url = new URL(
    `${proto}://${host}${pathname}${search ? `?${search}` : ""}`,
  );
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const contextKey = String(formData.get("contextKey") ?? "").trim();
  if (!contextKey) {
    return redirectTo(request, "/access?error=INVALID_CONTEXT_KEY");
  }

  const identity = await readAuthenticatedUserIdentity();
  if (!identity.ok) {
    return redirectTo(request, identity.reason === "NOT_USER" ? "/" : "/login");
  }

  let result;
  try {
    result = await enterContext(prisma, {
      userId: identity.identity.uid,
      contextKey,
      sessionVersion: identity.identity.sessionVersion,
    });
  } catch (error) {
    if (error instanceof ContextEntryError) {
      if (
        error.code === "USER_NOT_FOUND" ||
        error.code === "USER_INACTIVE" ||
        error.code === "SESSION_VERSION_STALE"
      ) {
        return redirectTo(request, "/login");
      }
      return redirectTo(request, `/access?error=${error.code}`);
    }
    throw error;
  }

  const jar = await cookies();
  const source = identity.identity.session;
  let internalDepartmentCarryover: string | null = null;
  if (
    result.kind === "facility_internal" &&
    result.facilityId &&
    source.scopeKind === "facility" &&
    source.accessKind !== "partner" &&
    source.authKind === "user"
  ) {
    const carry = await resolveDepartmentCarryoverForFacilitySwitch(prisma, {
      destinationFacilityId: result.facilityId,
      sourceDepartmentId: jar.get(ACTIVE_DEPARTMENT_COOKIE)?.value ?? source.primaryDepartmentId,
      sourceDepartmentKey: null,
    });
    internalDepartmentCarryover = carry.departmentCookieValue;
  }

  const response = redirectTo(request, result.redirectPath);
  applyContextTransitionCookies(
    response.cookies,
    {
      kind: result.kind,
      token: result.token,
      facilityId: result.facilityId,
      facilityPartnerOrganizationId: result.facilityPartnerOrganizationId,
      allowedDepartmentIds: result.allowedDepartmentIds,
    },
    {
      session: source,
      internalDepartmentId: jar.get(ACTIVE_DEPARTMENT_COOKIE)?.value,
      partnerDepartmentId: jar.get(PARTNER_ACTIVE_DEPARTMENT_COOKIE)?.value,
      internalDepartmentCarryover,
    },
  );
  return response;
}
