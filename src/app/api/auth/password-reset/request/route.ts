import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthRateLimitBucketType,
  checkAuthRateLimit,
  normalizeAccountIdentifier,
  passwordResetAccountBucketKey,
  passwordResetIpBucketKey,
  registerAuthFailure,
} from "@/lib/auth-rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";
import {
  buildPasswordResetUrl,
  issuePasswordResetToken,
  PASSWORD_RESET_EXPIRES_MINUTES,
} from "@/lib/password-reset/tokens";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  email: z.string().email().max(200),
});

const SUCCESS_BODY = {
  ok: true,
  message: "If an account exists for that email, we sent a reset link.",
} as const;

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const normalizedEmail = normalizeAccountIdentifier(parsed.data.email);
  let accountBucketKey: string;
  let ipBucketKey: string;
  try {
    accountBucketKey = passwordResetAccountBucketKey(normalizedEmail);
    ipBucketKey = passwordResetIpBucketKey(clientIp(request));
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

  // Always register a soft attempt so probing is throttled even when the email is unknown.
  await registerAuthFailure(buckets);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, displayName: true, isActive: true, passwordHash: true },
  });

  if (user?.isActive && user.passwordHash) {
    const issued = await issuePasswordResetToken(prisma, user.id);
    const resetUrl = buildPasswordResetUrl(new URL(request.url).origin, issued.rawToken);
    const sendResult = await sendPasswordResetEmail({
      to: user.email,
      displayName: user.displayName,
      resetUrl,
      expiresInMinutes: PASSWORD_RESET_EXPIRES_MINUTES,
    });
    if (!sendResult.sent && sendResult.reason === "send_failed") {
      console.info("password_reset_email_failed", { userId: user.id, error: sendResult.error });
    } else if (!sendResult.sent && sendResult.reason === "not_configured") {
      console.info("password_reset_email_skipped_not_configured", { userId: user.id });
    } else if (sendResult.sent) {
      console.info("password_reset_email_sent", { userId: user.id, messageId: sendResult.messageId });
    }
  }

  return NextResponse.json(SUCCESS_BODY);
}
