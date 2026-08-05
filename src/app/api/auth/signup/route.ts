import bcrypt from "bcryptjs";
import { EmployeeStatus, EmploymentType, RoleKey } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSessionToken, getCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { DEVICE_FACILITY_COOKIE, getDeviceCookieOptions } from "@/lib/device-cookie";
import { ensureUserFacilityAccessGrant } from "@/lib/facility-access";
import { createOrganizationForNewFacility } from "@/lib/organization";
import { ONBOARDING_ENTRY_PATH } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { rosterNameFromSignupDisplayName } from "@/lib/roster-name";
import { trackEvent } from "@/lib/telemetry";

const signupSchema = z.object({
  facilityName: z.string().trim().min(2).max(200),
  managementCompanyName: z.string().trim().max(200).optional(),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().email().max(200),
  password: z.string().min(10).max(128),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid sign-up details." }, { status: 400 });
  }

  const data = parsed.data;
  const email = data.adminEmail.toLowerCase();
  const managementCompanyName = data.managementCompanyName?.trim() ? data.managementCompanyName.trim() : null;

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
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
    email: created.user.email,
  });

  const response = NextResponse.json({ ok: true, nextPath: ONBOARDING_ENTRY_PATH });
  response.cookies.set(SESSION_COOKIE, token, getCookieOptions());
  response.cookies.set(DEVICE_FACILITY_COOKIE, created.facility.id, getDeviceCookieOptions());
  return response;
}
