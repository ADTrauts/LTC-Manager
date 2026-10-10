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
import { applyAccountSessionCookies, applyContextTransitionCookies } from "@/lib/context-entry";
import { PostAuthRoutingError, routeAuthenticatedUser } from "@/lib/post-auth-routing";
import { prisma } from "@/lib/prisma";

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
      emailVerifiedAt: true,
      sessionVersion: true,
    },
  });

  // Unknown and disabled accounts run a bcrypt comparison against a dummy hash so the response
  // time does not separate "no such account" from "wrong password", and both record a failure
  // so an attacker cannot probe for valid addresses without also being throttled.
  if (!user || !user.isActive) {
    await bcrypt.compare(password, ABSENT_ACCOUNT_HASH);
    await registerAuthFailure(buckets);
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  if (!user.passwordHash) {
    await bcrypt.compare(password, ABSENT_ACCOUNT_HASH);
    return NextResponse.json(
      {
        error: "Accept the invite email we sent to set your password before signing in.",
        code: "INVITE_PENDING",
      },
      { status: 403 },
    );
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    await registerAuthFailure(buckets);
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  if (!user.emailVerifiedAt) {
    return NextResponse.json(
      {
        error: "Verify your email before signing in. Check your inbox for the link we sent.",
        code: "EMAIL_NOT_VERIFIED",
      },
      { status: 403 },
    );
  }

  await resetAuthRateLimitBucket(accountBucketKey);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  let landing;
  try {
    landing = await routeAuthenticatedUser(prisma, {
      userId: user.id,
      sessionVersion: user.sessionVersion,
    });
  } catch (error) {
    if (error instanceof PostAuthRoutingError) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to complete sign-in." }, { status: 500 });
  }

  const response = NextResponse.json({
    ok: true,
    redirectPath: landing.redirectPath,
  });

  if (landing.kind === "account") {
    applyAccountSessionCookies(response.cookies, landing.token);
  } else {
    applyContextTransitionCookies(response.cookies, {
      kind: landing.destinationKind,
      token: landing.token,
      facilityId: landing.facilityId,
      facilityPartnerOrganizationId: landing.facilityPartnerOrganizationId,
      allowedDepartmentIds: landing.allowedDepartmentIds,
    });
  }

  return response;
}
