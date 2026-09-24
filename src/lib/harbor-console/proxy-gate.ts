import { NextResponse, type NextRequest } from "next/server";

import { validateHarborStaffSession } from "@/lib/harbor-console/auth";
import {
  HARBOR_SESSION_COOKIE,
  HARBOR_WORK_COOKIE,
  verifyHarborSessionToken,
} from "@/lib/harbor-console/session";
import { harborWorkCustomerPath, isHarborWorkPathAllowed } from "@/lib/harbor-console/work-paths";
import { readHarborWorkCookies } from "@/lib/harbor-console/work-session";
import { isApiPathname } from "@/lib/route-registry";

export function harborUnauthenticatedResponse(request: NextRequest) {
  if (isApiPathname(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/console/login", request.url));
}

function clearWorkCookie(response: NextResponse) {
  response.cookies.delete(HARBOR_WORK_COOKIE);
  return response;
}

export async function authorizeHarborRequest(request: NextRequest): Promise<NextResponse | null> {
  const token = request.cookies.get(HARBOR_SESSION_COOKIE)?.value;
  if (!token) {
    return harborUnauthenticatedResponse(request);
  }
  try {
    const session = await verifyHarborSessionToken(token);
    const authority = await validateHarborStaffSession(session);
    if (!authority.valid) {
      const response = harborUnauthenticatedResponse(request);
      response.cookies.delete(HARBOR_SESSION_COOKIE);
      return clearWorkCookie(response);
    }
    return null;
  } catch {
    const response = harborUnauthenticatedResponse(request);
    response.cookies.delete(HARBOR_SESSION_COOKIE);
    return clearWorkCookie(response);
  }
}

/**
 * When `harbor_work` is present, ignore `ltc_session` and only allow the builder allowlist.
 * Returns `"fallthrough"` when there is no work session so the facility proxy can run.
 */
export async function authorizeHarborWorkFacilityRequest(
  request: NextRequest,
): Promise<NextResponse | "fallthrough"> {
  const read = await readHarborWorkCookies((name) => request.cookies.get(name)?.value);
  if (read.status !== "ok") {
    return "fallthrough";
  }

  const { pathname } = request.nextUrl;
  if (isHarborWorkPathAllowed(pathname)) {
    return NextResponse.next();
  }

  if (isApiPathname(pathname)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  return NextResponse.redirect(new URL(harborWorkCustomerPath(read.work.facilityId), request.url));
}
