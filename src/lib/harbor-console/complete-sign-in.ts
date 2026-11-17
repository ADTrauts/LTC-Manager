import { NextResponse } from "next/server";

import { passwordAccountBucketKey, resetAuthRateLimitBucket } from "@/lib/auth-rate-limit";
import { getAppSession } from "@/lib/auth";
import { getAssistancePilot } from "@/lib/harbor-console/assistance-pilot";
import {
  createHarborSessionToken, getHarborCookieOptions, HARBOR_INITIAL_SESSION_VERSION, HARBOR_SESSION_COOKIE,
  resolveHarborSession, type HarborStaffRole,
} from "@/lib/harbor-console/auth";
import { revokePushForDepartingUser } from "@/lib/notifications/push-subscription";
import { prisma } from "@/lib/prisma";

export async function completeHarborSignIn(
  request: Request,
  staff: { id: string; email: string; displayName: string; role: HarborStaffRole; sessionVersion: number },
  mfaVerified = false,
) {
  const pilot = mfaVerified ? null : getAssistancePilot(request.headers.get("host") ?? new URL(request.url).host);
  const token = await createHarborSessionToken({
    uid: staff.id,
    email: staff.email,
    name: staff.displayName,
    staffRole: staff.role,
    sessionVersion: staff.sessionVersion ?? HARBOR_INITIAL_SESSION_VERSION,
  }, {
    bindAssistance: pilot?.staff.has(staff.id) ? true : undefined,
    mfaVerified: mfaVerified ? true : undefined,
  });

  // Do not issue a cookie unless the live authority and receipt store can validate it.
  if (!await resolveHarborSession(token)) {
    return NextResponse.json({ error: "Staff sign-in is temporarily unavailable." }, { status: 503 });
  }

  await resetAuthRateLimitBucket(passwordAccountBucketKey(`harbor:${staff.email}`));
  await prisma.platformStaff.update({
    where: { id: staff.id },
    data: { lastLoginAt: new Date() },
  });
  await prisma.harborAuditEvent.create({
    data: { staffId: staff.id, action: "LOGIN" },
  });

  try {
    const previous = await getAppSession();
    await revokePushForDepartingUser(prisma, previous, null, new Date());
  } catch {
    return NextResponse.json(
      { error: "Sign-in stopped. Browser alerts for the previous account are still active." },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(HARBOR_SESSION_COOKIE, token, getHarborCookieOptions());
  return response;
}
