import { NextResponse, type NextRequest } from "next/server";

import { validateHarborStaffSession } from "@/lib/harbor-console/auth";
import {
  HARBOR_SESSION_COOKIE,
  HARBOR_WORK_CLEANUP_PATH,
  HARBOR_WORK_COOKIE,
  verifyHarborSessionToken,
} from "@/lib/harbor-console/session";
import { isApiPathname } from "@/lib/route-registry";

export function harborUnauthenticatedResponse(request: NextRequest) {
  if (isApiPathname(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/console/login", request.url));
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
      return response;
    }
    return null;
  } catch {
    const response = harborUnauthenticatedResponse(request);
    response.cookies.delete(HARBOR_SESSION_COOKIE);
    return response;
  }
}

/** A retired work marker never falls through to an ambient customer session. */
export function rejectRetiredHarborWorkRequest(request: NextRequest): NextResponse | null {
  if (!request.cookies.has(HARBOR_WORK_COOKIE)) return null;
  if (isApiPathname(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "Clear the retired Facility work session before continuing." }, { status: 403 });
  }
  return NextResponse.redirect(new URL(HARBOR_WORK_CLEANUP_PATH, request.url), 303);
}
