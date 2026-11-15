import { NextResponse } from "next/server";

import { getHarborCookieOptions, HARBOR_SESSION_COOKIE, HARBOR_WORK_COOKIE } from "@/lib/harbor-console/auth";
import { sameOriginBrowserPost } from "@/lib/harbor-console/browser-post";

export async function POST(request: Request) {
  const origin = sameOriginBrowserPost(request);
  if (!origin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const response = NextResponse.redirect(new URL("/console/login", origin), 303);
  const expired = { ...getHarborCookieOptions(), maxAge: 0 };
  response.cookies.set(HARBOR_SESSION_COOKIE, "", expired);
  response.cookies.set(HARBOR_WORK_COOKIE, "", expired);
  return response;
}
