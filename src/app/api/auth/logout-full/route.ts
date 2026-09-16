import { NextResponse } from "next/server";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import { getCookieOptions, getSession, SESSION_COOKIE } from "@/lib/auth";
import { requirePasswordSession } from "@/lib/credential-policy";
import {
  DEVICE_FACILITY_COOKIE,
  DEVICE_UNIT_COOKIE,
  getDeviceCookieOptions,
} from "@/lib/device-cookie";
import { prisma } from "@/lib/prisma";
import { revokeOwnSessions } from "@/lib/session-revocation";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.facilityId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    requirePasswordSession(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Forbidden." },
      { status: 403 },
    );
  }

  if (!hasAtLeastRole(session.role as AppRole, "FACILITY_ADMINISTRATOR")) {
    return NextResponse.json({ error: "Only Facility Administrators can unbind this device." }, { status: 403 });
  }

  // Unbinding the device is a security action, so it ends every session for this identity rather
  // than only the cookie on this browser. A tablet handed back to the facility should not leave a
  // usable session behind on any device.
  await revokeOwnSessions(prisma, {
    kind: session.authKind === "employee" ? "employee" : "user",
    id: session.uid,
  });

  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL("/login", url.origin), 303);
  response.cookies.set(SESSION_COOKIE, "", { ...getCookieOptions(), maxAge: 0 });
  response.cookies.set(DEVICE_FACILITY_COOKIE, "", { ...getDeviceCookieOptions(), maxAge: 0 });
  response.cookies.set(DEVICE_UNIT_COOKIE, "", { ...getDeviceCookieOptions(), maxAge: 0 });
  return response;
}
