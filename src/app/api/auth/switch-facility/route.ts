import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createSessionToken,
  getCookieOptions,
  getSession,
  SESSION_COOKIE,
  sessionUserIdForFk,
} from "@/lib/auth";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/department-nav";
import { DEVICE_FACILITY_COOKIE, getDeviceCookieOptions } from "@/lib/device-cookie";
import { switchActiveFacility } from "@/lib/facility-access";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  facilityId: z.string().min(1).max(64),
});

/**
 * Switch active facility for email-authenticated users with an explicit grant.
 * Re-issues session JWT and updates User.facilityId. PIN sessions are rejected.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.facilityId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (session.authKind !== "user") {
    return NextResponse.json(
      { error: "Facility switching is not available for PIN sessions." },
      { status: 403 },
    );
  }

  const userId = sessionUserIdForFk(session);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid facility." }, { status: 400 });
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const deptMatch = cookieHeader.match(/(?:^|;\s*)ltc_active_department=([^;]*)/);
  const sourceDepartmentCookie = deptMatch?.[1] ? decodeURIComponent(deptMatch[1]) : null;

  let sourceDepartmentKey: string | null = null;
  const sourceDepartmentId = sourceDepartmentCookie || session.primaryDepartmentId || null;
  if (sourceDepartmentId) {
    const dept = await prisma.department.findUnique({
      where: { id: sourceDepartmentId },
      select: { key: true },
    });
    sourceDepartmentKey = dept?.key ?? null;
  }

  try {
    const result = await switchActiveFacility({
      userId,
      authKind: session.authKind,
      role: session.role,
      sourceFacilityId: session.facilityId,
      destinationFacilityId: parsed.data.facilityId,
      sourceDepartmentId,
      sourceDepartmentKey,
    });

    const token = await createSessionToken({
      uid: userId,
      authKind: "user",
      role: session.role,
      name: session.name,
      email: session.email,
      facilityId: result.facilityId,
      primaryDepartmentId: result.primaryDepartmentId,
      // Clear unit lock from prior facility
      activeUnitId: null,
    });

    const response = NextResponse.json({
      ok: true,
      facilityId: result.facilityId,
      facilityName: result.facilityName,
      redirectPath: result.redirectPath,
    });

    response.cookies.set(SESSION_COOKIE, token, getCookieOptions());
    response.cookies.set(DEVICE_FACILITY_COOKIE, result.facilityId, getDeviceCookieOptions());

    const cookieOpts = getCookieOptions();
    if (result.departmentCookieValue) {
      response.cookies.set(ACTIVE_DEPARTMENT_COOKIE, result.departmentCookieValue, cookieOpts);
    } else {
      response.cookies.delete(ACTIVE_DEPARTMENT_COOKIE);
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Facility switch failed.";
    const status =
      message.includes("denied") ||
      message.includes("rejected") ||
      message.includes("PIN")
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
