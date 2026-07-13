import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSessionToken, getCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { DEVICE_FACILITY_COOKIE, getDeviceCookieOptions } from "@/lib/device-cookie";
import {
  ensureUserFacilityAccessGrant,
  listActiveFacilityAccesses,
  userHasActiveFacilityAccess,
} from "@/lib/facility-access";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
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

  if (!user || !user.isActive || !user.role.isActive) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

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
    select: { facilityId: true, primaryDepartmentId: true },
  });
  activeFacilityId = refreshed?.facilityId ?? activeFacilityId;

  const token = await createSessionToken({
    uid: user.id,
    authKind: "user",
    role: user.role.key,
    name: user.displayName,
    email: user.email,
    facilityId: activeFacilityId,
    primaryDepartmentId: refreshed?.primaryDepartmentId ?? user.primaryDepartmentId,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, getCookieOptions());
  response.cookies.set(DEVICE_FACILITY_COOKIE, activeFacilityId, getDeviceCookieOptions());
  return response;
}
