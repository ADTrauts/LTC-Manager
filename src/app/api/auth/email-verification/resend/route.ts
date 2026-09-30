import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthRateLimitBucketType,
  checkAuthRateLimit,
  emailVerificationAccountBucketKey,
  emailVerificationIpBucketKey,
  normalizeAccountIdentifier,
  registerAuthFailure,
} from "@/lib/auth-rate-limit";
import { isEmailConfigured, sendSignupEmailVerification } from "@/lib/email";
import {
  buildEmailVerificationUrl,
  EMAIL_VERIFICATION_EXPIRES_HOURS,
  issueEmailVerificationToken,
} from "@/lib/email-verification/tokens";
import { prisma } from "@/lib/prisma";
import { isPublicSignupEnabled } from "@/lib/signup-policy";

const resendSchema = z.object({
  email: z.string().email().max(200),
});

const SUCCESS_BODY = {
  ok: true,
  message: "If that account still needs verification, we sent a new link.",
} as const;

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request) {
  if (!isPublicSignupEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = resendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const normalizedEmail = normalizeAccountIdentifier(parsed.data.email);
  let accountBucketKey: string;
  let ipBucketKey: string;
  try {
    accountBucketKey = emailVerificationAccountBucketKey(normalizedEmail);
    ipBucketKey = emailVerificationIpBucketKey(clientIp(request));
  } catch {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const buckets = [
    { key: accountBucketKey, type: AuthRateLimitBucketType.PASSWORD_ACCOUNT },
    { key: ipBucketKey, type: AuthRateLimitBucketType.PIN_FACILITY },
  ];
  const limit = await checkAuthRateLimit(buckets);
  if (limit.locked) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  await registerAuthFailure(buckets);

  if (!isEmailConfigured()) {
    return NextResponse.json(SUCCESS_BODY);
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      displayName: true,
      isActive: true,
      emailVerifiedAt: true,
    },
  });

  if (user?.isActive && !user.emailVerifiedAt) {
    const issued = await issueEmailVerificationToken(prisma, user.id);
    const verifyUrl = buildEmailVerificationUrl(new URL(request.url).origin, issued.rawToken);
    const sendResult = await sendSignupEmailVerification({
      to: user.email,
      displayName: user.displayName,
      verifyUrl,
      expiresInHours: EMAIL_VERIFICATION_EXPIRES_HOURS,
    });
    if (!sendResult.sent && sendResult.reason === "send_failed") {
      console.info("signup_verification_resend_failed", {
        userId: user.id,
        error: sendResult.error,
      });
    } else if (sendResult.sent) {
      console.info("signup_verification_resend_sent", {
        userId: user.id,
        messageId: sendResult.messageId,
      });
    }
  }

  return NextResponse.json(SUCCESS_BODY);
}
