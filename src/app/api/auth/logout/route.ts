import { NextResponse } from "next/server";

import { getCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  // 303 so the browser follows with GET; default 307 would repeat POST on /login and hang.
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(SESSION_COOKIE, "", {
    ...getCookieOptions(),
    maxAge: 0,
  });
  return response;
}
