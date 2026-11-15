import { NextResponse } from "next/server";

import { getHarborCookieOptions, getHarborSession, HARBOR_WORK_COOKIE } from "@/lib/harbor-console/auth";

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const staff = await getHarborSession();
  const destination = staff ? "/console/customers" : "/login";
  const response = NextResponse.redirect(new URL(destination, url), 303);
  response.cookies.set(HARBOR_WORK_COOKIE, "", { ...getHarborCookieOptions(), maxAge: 0 });
  return response;
}
