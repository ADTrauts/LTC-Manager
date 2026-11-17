import { type NextRequest, NextResponse } from "next/server";

import { getHarborCookieOptions, HARBOR_SESSION_COOKIE, HARBOR_WORK_COOKIE } from "@/lib/harbor-console/auth";
import { sameOriginBrowserPost } from "@/lib/harbor-console/browser-post";
import { endBrowserHarborLogin } from "@/lib/harbor-console/staff-logout";

export async function POST(request: NextRequest) {
  const origin = sameOriginBrowserPost(request);
  if (!origin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const token = request.cookies.get(HARBOR_SESSION_COOKIE)?.value;
  try {
    await endBrowserHarborLogin(token);
  } catch {
    return NextResponse.json({ error: "Sign-out could not be completed. Please try again." }, { status: 503 });
  }

  const response = NextResponse.redirect(new URL("/console/login", origin), 303);
  const expired = { ...getHarborCookieOptions(), maxAge: 0 };
  response.cookies.set(HARBOR_SESSION_COOKIE, "", expired);
  response.cookies.set(HARBOR_WORK_COOKIE, "", expired);
  return response;
}
