import { NextResponse } from "next/server";

import { getHarborCookieOptions, HARBOR_SESSION_COOKIE, HARBOR_WORK_COOKIE } from "@/lib/harbor-console/auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/console/login", request.url), 303);
  const expired = { ...getHarborCookieOptions(), maxAge: 0 };
  response.cookies.set(HARBOR_SESSION_COOKIE, "", expired);
  response.cookies.set(HARBOR_WORK_COOKIE, "", expired);
  return response;
}
