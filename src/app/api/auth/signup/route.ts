import bcrypt from "bcryptjs";
import { EmployeeStatus, EmploymentType, RoleKey } from "@prisma/client";
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
import { createSessionToken, getCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { DEVICE_FACILITY_COOKIE, getDeviceCookieOptions } from "@/lib/device-cookie";
import { ensureUserFacilityAccessGrant } from "@/lib/facility-access";
import { createOrganizationForNewFacility } from "@/lib/organization";
import { ONBOARDING_ENTRY_PATH } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { rosterNameFromSignupDisplayName } from "@/lib/roster-name";
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
  const managementCompanyName = data.managementCompanyName?.trim() ? data.managementCompanyName.trim() : null;

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

  const gmRole = await prisma.role.findUnique({ where: { key: "GM" }, select: { id: true, key: true } });
  if (!gmRole) {
    return NextResponse.json({ error: "System roles are not initialized yet." }, { status: 500 });
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const { firstName, lastName } = rosterNameFromSignupDisplayName(data.adminName);

  const created = await prisma.$transaction(async (tx) => {
    const organization = await createOrganizationForNewFacility(tx, {
      facilityName: data.facilityName,
      managementCompanyName,
    });

    const facility = await tx.facility.create({
      data: {
        displayName: data.facilityName,
        managementCompanyName,
        organizationId: organization.id,
        billingEmail: email,
        onboardingStartedAt: new Date(),
        onboardingCurrentStep: "facility",
      },
    });

    const user = await tx.user.create({
      data: {
        facilityId: facility.id,
        roleId: gmRole.id,
        displayName: data.adminName,
        email,
        passwordHash,
        isActive: true,
      },
      include: { role: true },
    });

    await ensureUserFacilityAccessGrant(tx, {
      userId: user.id,
      facilityId: facility.id,
    });

    await tx.employee.create({
      data: {
        facilityId: facility.id,
        firstName,
        lastName,
        email,
        roleType: RoleKey.GM,
        status: EmployeeStatus.ACTIVE,
        employmentType: EmploymentType.FULL_TIME,
      },
    });

    return { facility, user };
  });

  await resetAuthRateLimitBucket(accountBucketKey);

  const token = await createSessionToken({
    uid: created.user.id,
    authKind: "user",
    role: created.user.role.key,
    name: created.user.displayName,
    email: created.user.email,
    facilityId: created.user.facilityId,
    sessionVersion: created.user.sessionVersion,
  });

  await trackEvent("signup.completed", {
    facilityId: created.facility.id,
    userId: created.user.id,
  });

  const response = NextResponse.json({ ok: true, nextPath: ONBOARDING_ENTRY_PATH });
  response.cookies.set(SESSION_COOKIE, token, getCookieOptions());
  response.cookies.set(DEVICE_FACILITY_COOKIE, created.facility.id, getDeviceCookieOptions());
  return response;
}
