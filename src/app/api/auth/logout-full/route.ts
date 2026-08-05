import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import { getCookieOptions, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import {
  DEVICE_FACILITY_COOKIE,
  DEVICE_UNIT_COOKIE,
  getDeviceCookieOptions,
} from "@/lib/device-cookie";
import { prisma } from "@/lib/prisma";
import { revokeOwnSessions } from "@/lib/session-revocation";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let session: Awaited<ReturnType<typeof verifySessionToken>>;
  try {
    session = await verifySessionToken(raw);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
