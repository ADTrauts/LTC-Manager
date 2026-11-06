import { PROOF_COOKIE, proofCookieOptions } from "@/lib/offline/space/keys";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getCookieOptions, SESSION_COOKIE, userSessionKey, verifySessionToken } from "@/lib/auth";
import type { AppJwtPayload } from "@/lib/auth";
import { logoutClearsSession } from "@/lib/notifications/push-authorization";
import { revokeAuthenticatedUserPush } from "@/lib/notifications/push-subscription";
import { prisma } from "@/lib/prisma";
import { endSignedOutUserCredential } from "@/lib/session-revocation";

function clearSessionCookies(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    ...getCookieOptions(),
    maxAge: 0,
  });
  response.cookies.set(PROOF_COOKIE, "", { ...proofCookieOptions(), maxAge: 0 });
}

function credentialExpiry(session: AppJwtPayload): Date {
  if (typeof session.exp === "number" && Number.isFinite(session.exp)) {
    return new Date(session.exp * 1000);
  }
  return new Date(Date.now() + 12 * 60 * 60 * 1000);
}

export async function POST(request: Request) {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  let presented: AppJwtPayload | null = null;
  if (raw) {
    try {
      presented = await verifySessionToken(raw);
    } catch {
      presented = null;
    }
  }
  const userPresented = presented?.authKind === "user" ? presented : null;
  let outcome: "revoked" | "skipped" = "skipped";
  if (userPresented) {
    try {
      await prisma.$transaction(async (tx) => {
        const push = await revokeAuthenticatedUserPush(tx, userPresented, new Date());
        if (push !== "revoked") {
          throw new Error("push_not_revoked");
        }
        await endSignedOutUserCredential(tx, {
          userId: userPresented.uid,
          jti: userSessionKey(userPresented),
          expiresAt: credentialExpiry(userPresented),
        });
      });
      outcome = "revoked";
    } catch {
      return NextResponse.json(
        {
          error: "Sign out stopped. Browser alerts are still tied to this account.",
          outcome: "failed",
        },
        { status: 503 },
      );
    }
  }

  // The account menu posts JSON and must be able to read the result.
  // A 303 is opaque to that fetch, so it cannot prove the User was revoked.
  // Cookies stay until revocation commits, including a no-JS form post.
  const wantsJson = (request.headers.get("content-type") ?? "").includes("application/json");
  if (!logoutClearsSession(outcome)) {
    if (wantsJson) {
      return NextResponse.json({ outcome: "anonymous" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  if (wantsJson) {
    const response = NextResponse.json({ outcome: "revoked" });
    clearSessionCookies(response);
    return response;
  }

  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  clearSessionCookies(response);
  return response;
}
