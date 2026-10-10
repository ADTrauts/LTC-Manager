import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { findValidAccountInviteToken } from "@/lib/account-invite/tokens";
import { internalFacilityContextKey } from "@/lib/available-contexts";
import {
  applyAuthenticatedUserLandingCookies,
  enterGrantedContext,
  PostAuthRoutingError,
  routeAuthenticatedUser,
} from "@/lib/post-auth-routing";
import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/telemetry";

const confirmSchema = z
  .object({
    token: z.string().trim().min(20).max(200),
    password: z.string().min(10).max(128),
    confirmPassword: z.string().min(10).max(128),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Unable to accept this invite." },
      { status: 400 },
    );
  }

  const token = await findValidAccountInviteToken(prisma, parsed.data.token);
  if (!token) {
    return NextResponse.json({ error: "This invite link is invalid or expired." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: token.userId, isActive: true },
    select: {
      id: true,
      email: true,
      displayName: true,
      facilityId: true,
      passwordHash: true,
      sessionVersion: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "This invite link is invalid or expired." }, { status: 400 });
  }
  if (user.passwordHash) {
    return NextResponse.json(
      { error: "This account already has a password. Sign in or reset your password." },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.accountInviteToken.update({
      where: { id: token.id },
      data: { usedAt: now },
    });
    await tx.accountInviteToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        emailVerifiedAt: now,
        lastLoginAt: now,
      },
    });
  });

  const refreshed = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, facilityId: true, sessionVersion: true, isActive: true },
  });
  if (!refreshed?.isActive) {
    return NextResponse.json({ error: "This invite link is invalid or expired." }, { status: 400 });
  }

  try {
    const landing = refreshed.facilityId
      ? await enterGrantedContext(prisma, {
          userId: refreshed.id,
          contextKey: internalFacilityContextKey(refreshed.facilityId),
          sessionVersion: refreshed.sessionVersion,
        })
      : await routeAuthenticatedUser(prisma, {
          userId: refreshed.id,
          sessionVersion: refreshed.sessionVersion,
        });

    await trackEvent("account.invite_accepted", {
      facilityId: refreshed.facilityId,
      userId: refreshed.id,
    });

    const response = NextResponse.json({
      ok: true,
      nextPath: landing.redirectPath,
    });
    applyAuthenticatedUserLandingCookies(response.cookies, landing);
    return response;
  } catch (error) {
    if (error instanceof PostAuthRoutingError) {
      return NextResponse.json({ error: "This invite link is invalid or expired." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to complete this invite." }, { status: 500 });
  }
}
