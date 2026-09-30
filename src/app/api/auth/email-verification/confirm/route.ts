import { NextResponse } from "next/server";
import { z } from "zod";

import { createSessionToken, getCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { DEVICE_FACILITY_COOKIE, getDeviceCookieOptions } from "@/lib/device-cookie";
import {
  findValidEmailVerificationToken,
  markEmailVerified,
} from "@/lib/email-verification/tokens";
import { ONBOARDING_ENTRY_PATH } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

const confirmSchema = z.object({
  token: z.string().trim().min(20).max(200),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  }

  const token = await findValidEmailVerificationToken(prisma, parsed.data.token);
  if (!token) {
    return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: token.userId, isActive: true },
    select: {
      id: true,
      email: true,
      displayName: true,
      facilityId: true,
      emailVerifiedAt: true,
      sessionVersion: true,
      role: { select: { key: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  }

  if (!user.emailVerifiedAt) {
    await markEmailVerified(prisma, { userId: user.id, tokenId: token.id });
  } else {
    await prisma.emailVerificationToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });
  }

  const sessionToken = await createSessionToken({
    uid: user.id,
    authKind: "user",
    role: user.role.key,
    name: user.displayName,
    email: user.email,
    facilityId: user.facilityId,
    sessionVersion: user.sessionVersion,
  });

  await trackEvent("signup.email_verified", {
    facilityId: user.facilityId,
    userId: user.id,
  });

  const response = NextResponse.json({ ok: true, nextPath: ONBOARDING_ENTRY_PATH });
  response.cookies.set(SESSION_COOKIE, sessionToken, getCookieOptions());
  response.cookies.set(DEVICE_FACILITY_COOKIE, user.facilityId, getDeviceCookieOptions());
  return response;
}
