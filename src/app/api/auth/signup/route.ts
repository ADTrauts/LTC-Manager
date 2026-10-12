import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthRateLimitBucketType,
  checkAuthRateLimit,
  registerAuthFailure,
  resetAuthRateLimitBucket,
  signupAccountBucketKey,
  signupIpBucketKey,
} from "@/lib/auth-rate-limit";
import { internalFacilityContextKey } from "@/lib/available-contexts";
import { isEmailConfigured, sendSignupEmailVerification } from "@/lib/email";
import {
  buildEmailVerificationUrl,
  EMAIL_VERIFICATION_EXPIRES_HOURS,
  issueEmailVerificationToken,
} from "@/lib/email-verification/tokens";
import { bootstrapFacilityCustomer } from "@/lib/facility-provisioning";
import { ONBOARDING_ENTRY_PATH } from "@/lib/onboarding";
import {
  applyAuthenticatedUserLandingCookies,
  enterGrantedContext,
  PostAuthRoutingError,
} from "@/lib/post-auth-routing";
import { prisma } from "@/lib/prisma";
import { isPublicSignupEnabled } from "@/lib/signup-policy";
import { trackEvent } from "@/lib/telemetry";

const signupSchema = z.object({
  facilityName: z.string().trim().min(2).max(200),
  managementCompanyName: z.string().trim().max(200).optional(),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().email().max(200),
  password: z.string().min(10).max(128),
});

const GENERIC_SIGNUP_FAILURE = "Unable to create this account.";
const ABSENT_ACCOUNT_HASH = "$2b$12$rCdyNVV46Cv/BVCvwO7yr.HodwJjXsOHTs.p50w/FDaA5JjG./Vli";
const CHECK_EMAIL_PATH = "/check-email";

function clientIpLabel(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return ip.slice(0, 64);
}

function rateLimitedResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too many attempts. Try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

export async function POST(request: Request) {
  if (!isPublicSignupEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_SIGNUP_FAILURE }, { status: 400 });
  }

  const data = parsed.data;
  const email = data.adminEmail.toLowerCase();
  const managementCompanyName = data.managementCompanyName?.trim()
    ? data.managementCompanyName.trim()
    : null;

  let accountBucketKey: string;
  let ipBucketKey: string;
  try {
    accountBucketKey = signupAccountBucketKey(email);
    ipBucketKey = signupIpBucketKey(clientIpLabel(request));
  } catch {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const buckets = [
    { key: accountBucketKey, type: AuthRateLimitBucketType.PASSWORD_ACCOUNT },
    { key: ipBucketKey, type: AuthRateLimitBucketType.PIN_FACILITY },
  ];
  const limit = await checkAuthRateLimit(buckets);
  if (limit.locked) {
    return rateLimitedResponse(limit.retryAfterSec);
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    await bcrypt.compare(data.password, ABSENT_ACCOUNT_HASH);
    await registerAuthFailure(buckets);
    return NextResponse.json({ error: GENERIC_SIGNUP_FAILURE }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const mailConfigured = isEmailConfigured();

  const created = await prisma.$transaction(async (tx) => {
    const provisioned = await bootstrapFacilityCustomer(tx, {
      organization: {
        mode: "create",
        facilityName: data.facilityName,
        managementCompanyName,
      },
      facility: {
        displayName: data.facilityName,
        billingEmail: email,
        managementCompanyName,
      },
      administrator: {
        mode: "create",
        email,
        displayName: data.adminName,
        passwordHash,
        emailVerifiedAt: mailConfigured ? null : new Date(),
      },
    });
    return {
      facility: { id: provisioned.facility.id },
      user: {
        id: provisioned.user.id,
        email: provisioned.user.email,
        displayName: provisioned.user.displayName,
        emailVerifiedAt: mailConfigured ? null : new Date(),
      },
    };
  });

  await resetAuthRateLimitBucket(accountBucketKey);

  if (!mailConfigured || created.user.emailVerifiedAt) {
    const refreshed = await prisma.user.findUnique({
      where: { id: created.user.id },
      select: { sessionVersion: true, isActive: true },
    });
    if (!refreshed?.isActive) {
      return NextResponse.json(
        { ok: true, nextPath: "/login", sessionPending: true },
      );
    }

    try {
      const landing = await enterGrantedContext(prisma, {
        userId: created.user.id,
        contextKey: internalFacilityContextKey(created.facility.id),
        sessionVersion: refreshed.sessionVersion,
      });
      await trackEvent("signup.completed", {
        facilityId: created.facility.id,
        userId: created.user.id,
      });
      const response = NextResponse.json({ ok: true, nextPath: ONBOARDING_ENTRY_PATH });
      applyAuthenticatedUserLandingCookies(response.cookies, landing);
      return response;
    } catch (error) {
      if (error instanceof PostAuthRoutingError) {
        return NextResponse.json({ ok: true, nextPath: "/login", sessionPending: true });
      }
      return NextResponse.json({ ok: true, nextPath: "/login", sessionPending: true });
    }
  }

  const issued = await issueEmailVerificationToken(prisma, created.user.id);
  const verifyUrl = buildEmailVerificationUrl(new URL(request.url).origin, issued.rawToken);
  const sendResult = await sendSignupEmailVerification({
    to: created.user.email,
    displayName: created.user.displayName,
    verifyUrl,
    expiresInHours: EMAIL_VERIFICATION_EXPIRES_HOURS,
  });
  if (!sendResult.sent && sendResult.reason === "send_failed") {
    console.info("signup_verification_email_failed", {
      userId: created.user.id,
      error: sendResult.error,
    });
  } else if (sendResult.sent) {
    console.info("signup_verification_email_sent", {
      userId: created.user.id,
      messageId: sendResult.messageId,
    });
  }

  await trackEvent("signup.pending_verification", {
    facilityId: created.facility.id,
    userId: created.user.id,
  });

  return NextResponse.json({
    ok: true,
    nextPath: `${CHECK_EMAIL_PATH}?email=${encodeURIComponent(created.user.email)}`,
    pendingVerification: true,
  });
}
