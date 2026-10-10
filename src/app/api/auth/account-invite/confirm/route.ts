import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSessionToken, getCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { findValidAccountInviteToken } from "@/lib/account-invite/tokens";
import { DEVICE_FACILITY_COOKIE, getDeviceCookieOptions } from "@/lib/device-cookie";
import { ensureUserFacilityAccessGrant } from "@/lib/facility-access";
import {
  internalRoleKeyAsAppRole,
  resolveInternalFacilitySessionRole,
} from "@/lib/facility-access/internal-facility-role";
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
      role: { select: { key: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "This invite link is invalid or expired." }, { status: 400 });
  }
  // Account invites are Facility-native only. Organization claim acceptance is a separate flow.
  if (!user.facilityId || !user.role?.key) {
    return NextResponse.json(
      { error: "This invite link is invalid or expired." },
      { status: 400 },
    );
  }
  if (user.passwordHash) {
    return NextResponse.json(
      { error: "This account already has a password. Sign in or reset your password." },
      { status: 400 },
    );
  }

  const facilityId = user.facilityId;
  const roleKey = user.role.key;

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

  await ensureUserFacilityAccessGrant(prisma, {
    userId: user.id,
    facilityId,
    roleKey,
  });
  const resolved = await resolveInternalFacilitySessionRole(prisma, {
    userId: user.id,
    facilityId,
    fallbackRoleKey: roleKey,
  });
  if (!resolved) {
    return NextResponse.json({ error: "This invite link is invalid or expired." }, { status: 400 });
  }

  const sessionToken = await createSessionToken({
    uid: user.id,
    authKind: "user",
    role: internalRoleKeyAsAppRole(resolved.roleKey),
    name: user.displayName,
    email: user.email,
    facilityId,
    sessionVersion: user.sessionVersion,
  });

  await trackEvent("account.invite_accepted", {
    facilityId,
    userId: user.id,
  });

  const response = NextResponse.json({ ok: true, nextPath: "/dashboard" });
  response.cookies.set(SESSION_COOKIE, sessionToken, getCookieOptions());
  response.cookies.set(DEVICE_FACILITY_COOKIE, facilityId, getDeviceCookieOptions());
  return response;
}
