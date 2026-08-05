import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthRateLimitBucketType,
  checkAuthRateLimit,
  normalizeAccountIdentifier,
  passwordAccountBucketKey,
  registerAuthFailure,
  resetAuthRateLimitBucket,
} from "@/lib/auth-rate-limit";
import { createSessionToken, getCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { DEVICE_FACILITY_COOKIE, getDeviceCookieOptions } from "@/lib/device-cookie";
import {
  ensureUserFacilityAccessGrant,
  listActiveFacilityAccesses,
  userHasActiveFacilityAccess,
} from "@/lib/facility-access";
import { prisma } from "@/lib/prisma";
import { INITIAL_SESSION_VERSION } from "@/lib/session-revocation";

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
});

/**
 * Cost-12 hash of a fixed placeholder, compared against when no usable account is found so that
 * the handler spends comparable time on absent and present accounts. It guards no account.
 */
const ABSENT_ACCOUNT_HASH = "$2b$12$rCdyNVV46Cv/BVCvwO7yr.HodwJjXsOHTs.p50w/FDaA5JjG./Vli";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = normalizeAccountIdentifier(email);

  let accountBucketKey: string;
  try {
    accountBucketKey = passwordAccountBucketKey(normalizedEmail);
  } catch {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }
  const buckets = [
    { key: accountBucketKey, type: AuthRateLimitBucketType.PASSWORD_ACCOUNT },
  ];

  // Checked before the bcrypt comparison so a locked account cannot be used to burn CPU.
  const limit = await checkAuthRateLimit(buckets);
  if (limit.locked) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      displayName: true,
      passwordHash: true,
      isActive: true,
      facilityId: true,
      primaryDepartmentId: true,
      role: { select: { key: true, isActive: true } },
    },
  });

  // Unknown and disabled accounts run a bcrypt comparison against a dummy hash so the response
  // time does not separate "no such account" from "wrong password", and both record a failure
  // so an attacker cannot probe for valid addresses without also being throttled.
  if (!user || !user.isActive || !user.role.isActive) {
    await bcrypt.compare(password, ABSENT_ACCOUNT_HASH);
    await registerAuthFailure(buckets);
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    await registerAuthFailure(buckets);
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  await resetAuthRateLimitBucket(accountBucketKey);

  let activeFacilityId = user.facilityId;
  const hasCurrent = await userHasActiveFacilityAccess(prisma, user.id, user.facilityId);
  if (!hasCurrent) {
    // Compat repair: ensure home facility grant, else fall back to another active grant.
    await ensureUserFacilityAccessGrant(prisma, {
      userId: user.id,
      facilityId: user.facilityId,
      reactivate: false,
    });
    const stillMissing = !(await userHasActiveFacilityAccess(prisma, user.id, user.facilityId));
    if (stillMissing) {
      const accesses = await listActiveFacilityAccesses(prisma, user.id);
      const fallback = accesses[0];
      if (!fallback) {
        return NextResponse.json({ error: "No facility access." }, { status: 403 });
      }
      activeFacilityId = fallback.facilityId;
      await prisma.user.update({
        where: { id: user.id },
        data: { facilityId: activeFacilityId, lastLoginAt: new Date() },
      });
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  }

  // Ensure grant exists for the facility we will session into.
  await ensureUserFacilityAccessGrant(prisma, {
    userId: user.id,
    facilityId: activeFacilityId,
  });

  const refreshed = await prisma.user.findUnique({
    where: { id: user.id },
    select: { facilityId: true, primaryDepartmentId: true, sessionVersion: true },
  });
  activeFacilityId = refreshed?.facilityId ?? activeFacilityId;

  const token = await createSessionToken({
    uid: user.id,
    authKind: "user",
    authMethod: "PASSWORD",
    role: user.role.key,
    name: user.displayName,
    email: user.email,
    facilityId: activeFacilityId,
    primaryDepartmentId: refreshed?.primaryDepartmentId ?? user.primaryDepartmentId,
    sessionVersion: refreshed?.sessionVersion ?? INITIAL_SESSION_VERSION,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, getCookieOptions());
  response.cookies.set(DEVICE_FACILITY_COOKIE, activeFacilityId, getDeviceCookieOptions());
  return response;
}
