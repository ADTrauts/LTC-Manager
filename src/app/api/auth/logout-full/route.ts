import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import { getCookieOptions, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import {
  DEVICE_FACILITY_COOKIE,
  DEVICE_UNIT_COOKIE,
  getDeviceCookieOptions,
} from "@/lib/device-cookie";

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

  if (!hasAtLeastRole(session.role as AppRole, "GM")) {
    return NextResponse.json({ error: "Only General Managers can unbind this device." }, { status: 403 });
  }

  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL("/login", url.origin), 303);
  response.cookies.set(SESSION_COOKIE, "", { ...getCookieOptions(), maxAge: 0 });
  response.cookies.set(DEVICE_FACILITY_COOKIE, "", { ...getDeviceCookieOptions(), maxAge: 0 });
  response.cookies.set(DEVICE_UNIT_COOKIE, "", { ...getDeviceCookieOptions(), maxAge: 0 });
  return response;
}
