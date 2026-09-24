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
import {
  createHarborSessionToken,
  getHarborCookieOptions,
  HARBOR_INITIAL_SESSION_VERSION,
  HARBOR_SESSION_COOKIE,
} from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
});

const ABSENT_ACCOUNT_HASH = "$2b$12$rCdyNVV46Cv/BVCvwO7yr.HodwJjXsOHTs.p50w/FDaA5JjG./Vli";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 400 });
  }

  const normalizedEmail = normalizeAccountIdentifier(parsed.data.email);
  let accountBucketKey: string;
  try {
    accountBucketKey = passwordAccountBucketKey(`harbor:${normalizedEmail}`);
  } catch {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }
  const buckets = [{ key: accountBucketKey, type: AuthRateLimitBucketType.PASSWORD_ACCOUNT }];
  const limit = await checkAuthRateLimit(buckets);
  if (limit.locked) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const staff = await prisma.platformStaff.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      displayName: true,
      passwordHash: true,
      role: true,
      isActive: true,
      sessionVersion: true,
    },
  });

  if (!staff || !staff.isActive) {
    await bcrypt.compare(parsed.data.password, ABSENT_ACCOUNT_HASH);
    await registerAuthFailure(buckets);
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const isValid = await bcrypt.compare(parsed.data.password, staff.passwordHash);
  if (!isValid) {
    await registerAuthFailure(buckets);
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  await resetAuthRateLimitBucket(accountBucketKey);
  await prisma.platformStaff.update({
    where: { id: staff.id },
    data: { lastLoginAt: new Date() },
  });
  await prisma.harborAuditEvent.create({
    data: { staffId: staff.id, action: "LOGIN" },
  });

  const token = await createHarborSessionToken({
    uid: staff.id,
    email: staff.email,
    name: staff.displayName,
    staffRole: staff.role,
    sessionVersion: staff.sessionVersion ?? HARBOR_INITIAL_SESSION_VERSION,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(HARBOR_SESSION_COOKIE, token, getHarborCookieOptions());
  return response;
}
