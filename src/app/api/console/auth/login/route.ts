import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthRateLimitBucketType,
  checkAuthRateLimit,
  normalizeAccountIdentifier,
  passwordAccountBucketKey,
  registerAuthFailure,
} from "@/lib/auth-rate-limit";
import { completeHarborSignIn } from "@/lib/harbor-console/complete-sign-in";
import { secret, StaffLifecycleDenied } from "@/lib/harbor-console/lifecycle/ceremony";
import { STAFF_MFA_COOKIE, STAFF_MFA_PATH, staffLifecycleConfig, staffLifecycleRequested } from "@/lib/harbor-console/lifecycle/gate";
import { beginMfaSignIn } from "@/lib/harbor-console/lifecycle/identity";
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

  if (staffLifecycleRequested()) {
    const config = staffLifecycleConfig(request);
    if (!config) return NextResponse.json({ error: "Staff sign-in is temporarily unavailable." }, { status: 503 });
    try {
      const browserProof = secret();
      const response = NextResponse.json({ mfa: await beginMfaSignIn(config, staff.id, staff.sessionVersion, browserProof) }, {
        headers: { "cache-control": "no-store" },
      });
      response.cookies.set({ name: STAFF_MFA_COOKIE, value: browserProof, httpOnly: true, sameSite: "strict",
        path: STAFF_MFA_PATH, maxAge: 300, secure: process.env.NODE_ENV === "production" });
      return response;
    } catch (error) {
      if (error instanceof StaffLifecycleDenied) {
        return NextResponse.json({ error: "Enrollment is required before signing in." }, { status: 403 });
      }
      return NextResponse.json({ error: "Staff sign-in is temporarily unavailable." }, { status: 503 });
    }
  }
  return completeHarborSignIn(request, staff);
}
