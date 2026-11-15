import { NextResponse } from "next/server";

import { getHarborCookieOptions, getHarborSession, HARBOR_WORK_COOKIE } from "@/lib/harbor-console/auth";
import { sameOriginBrowserPost } from "@/lib/harbor-console/browser-post";

export async function POST(request: Request) {
  const origin = sameOriginBrowserPost(request);
  if (!origin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const staff = await getHarborSession();
  const destination = staff ? "/console/customers" : "/login";
  const response = NextResponse.redirect(new URL(destination, origin), 303);
  response.cookies.set(HARBOR_WORK_COOKIE, "", { ...getHarborCookieOptions(), maxAge: 0 });
  return response;
}
