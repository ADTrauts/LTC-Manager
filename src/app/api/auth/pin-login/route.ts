import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSessionToken, getCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import {
  DEVICE_FACILITY_COOKIE,
  DEVICE_UNIT_COOKIE,
  getDeviceCookieOptions,
} from "@/lib/device-cookie";
import { getEmployeeAllowedUnitIdSet, resolveInitialActiveUnitIdForPinLogin } from "@/lib/employee-units";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { checkPinRateLimit, registerPinFailure, registerPinSuccess } from "@/lib/pin-rate-limit";
import { isValidPinFormat, pinDigestForFacility } from "@/lib/pin";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  pin: z.string().trim().min(6).max(6),
});

function clientKey(request: Request) {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return ip;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const facilityId = cookieStore.get(DEVICE_FACILITY_COOKIE)?.value;
  if (!facilityId) {
    return NextResponse.json({ error: "This device is not bound to a facility." }, { status: 400 });
  }

  const facilityRow = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: { id: true },
  });
  if (!facilityRow) {
    const res = NextResponse.json(
      {
        error:
          "This browser still has an old facility binding. Sign in with email once, or clear site cookies for this origin.",
      },
      { status: 400 },
    );
    res.cookies.set(DEVICE_FACILITY_COOKIE, "", { ...getDeviceCookieOptions(), maxAge: 0 });
    res.cookies.set(DEVICE_UNIT_COOKIE, "", { ...getDeviceCookieOptions(), maxAge: 0 });
    return res;
  }

  const rawDeviceUnitId = cookieStore.get(DEVICE_UNIT_COOKIE)?.value;
  let deviceUnitId: string | undefined;
  let clearStaleUnitCookie = false;
  if (rawDeviceUnitId) {
    const u = await prisma.unit.findFirst({
      where: { id: rawDeviceUnitId, facilityId, isActive: true },
      select: { id: true },
    });
    if (u) {
      deviceUnitId = u.id;
    } else {
      clearStaleUnitCookie = true;
    }
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || !isValidPinFormat(parsed.data.pin)) {
    return NextResponse.json({ error: "Enter a valid 6-digit PIN." }, { status: 400 });
  }

  const ck = clientKey(request);
  const limit = checkPinRateLimit(facilityId, ck);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${limit.retryAfterSec} seconds.` },
      { status: 429 },
    );
  }

  let digest: string;
  try {
    digest = pinDigestForFacility(facilityId, parsed.data.pin);
  } catch {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const employee = await prisma.employee.findFirst({
    where: {
      facilityId,
      pinDigest: digest,
      status: "ACTIVE",
    },
    select: {
      id: true,
      facilityId: true,
      firstName: true,
      lastName: true,
      email: true,
      roleType: true,
      primaryUnitId: true,
      primaryDepartmentId: true,
    },
  });

  if (!employee) {
    registerPinFailure(facilityId, ck);
    return NextResponse.json({ error: "Invalid PIN." }, { status: 401 });
  }

  registerPinSuccess(facilityId, ck);

  let activeUnitId: string | undefined;
  let kioskUnitAccessWarning = false;

  if (deviceUnitId) {
    activeUnitId = deviceUnitId;
    const allowed = await getEmployeeAllowedUnitIdSet(employee.id);
    const restricted = allowed !== null;
    const allowedHere = !restricted || allowed.has(deviceUnitId);
    if (!allowedHere) {
      kioskUnitAccessWarning = true;
      await prisma.kioskUnitPinLoginEvent.create({
        data: {
          facilityId: employee.facilityId,
          employeeId: employee.id,
          unitId: deviceUnitId,
          unassignedToUnit: true,
          clientIp: ck === "unknown" ? null : ck.slice(0, 64),
        },
      });
    }
  } else {
    activeUnitId = await resolveInitialActiveUnitIdForPinLogin({
      id: employee.id,
      facilityId: employee.facilityId,
      primaryUnitId: employee.primaryUnitId,
    });
  }

  const token = await createSessionToken({
    uid: employee.id,
    authKind: "employee",
    role: employee.roleType,
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    email: employee.email ?? "",
    facilityId: employee.facilityId,
    activeUnitId,
    kioskUnitAccessWarning,
    primaryDepartmentId: employee.primaryDepartmentId,
  });

  const redirectTo = resolveDefaultHomePath({
    authKind: "employee",
    role: employee.roleType,
    activeUnitId,
    lockedUnitId: deviceUnitId,
  });

  const response = NextResponse.json({ ok: true, redirectTo });
  response.cookies.set(SESSION_COOKIE, token, getCookieOptions());
  response.cookies.set(DEVICE_FACILITY_COOKIE, facilityId, getDeviceCookieOptions());
  if (clearStaleUnitCookie) {
    response.cookies.set(DEVICE_UNIT_COOKIE, "", { ...getDeviceCookieOptions(), maxAge: 0 });
  }
  return response;
}
