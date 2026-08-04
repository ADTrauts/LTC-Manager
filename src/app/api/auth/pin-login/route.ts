import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthRateLimitBucketType,
  checkAuthRateLimit,
  pinCandidateBucketKey,
  pinFacilityBucketKey,
  registerAuthFailure,
  resetAuthRateLimitBucket,
  type AuthRateLimitBucketRef,
} from "@/lib/auth-rate-limit";
import { createSessionToken, getCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { mayAuthenticateWithQuickPin } from "@/lib/credential-policy";
import {
  DEVICE_FACILITY_COOKIE,
  DEVICE_UNIT_COOKIE,
  getDeviceCookieOptions,
} from "@/lib/device-cookie";
import { getEmployeeAllowedUnitIdSet, resolveInitialActiveUnitIdForPinLogin } from "@/lib/employee-units";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { isValidPinFormat, pinDigestForFacility } from "@/lib/pin";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  pin: z.string().trim().min(6).max(6),
});

/**
 * Single message for every authentication failure. A wrong PIN, an inactive Employee, and a
 * correct PIN belonging to a password-required role must be indistinguishable to the caller.
 */
const GENERIC_PIN_FAILURE = "Invalid PIN.";

function rateLimitedResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too many attempts. Try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

/**
 * Only a diagnostic label on the kiosk audit record. It is never a rate-limit key, so a rotated
 * forwarded-for header cannot influence throttling.
 */
function clientIpLabel(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  return ip ? ip.slice(0, 64) : null;
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

  let candidateBucketKey: string;
  let buckets: AuthRateLimitBucketRef[];
  let digest: string;
  try {
    candidateBucketKey = pinCandidateBucketKey(facilityId, parsed.data.pin);
    buckets = [
      { key: candidateBucketKey, type: AuthRateLimitBucketType.PIN_CANDIDATE },
      { key: pinFacilityBucketKey(facilityId), type: AuthRateLimitBucketType.PIN_FACILITY },
    ];
    digest = pinDigestForFacility(facilityId, parsed.data.pin);
  } catch {
    return NextResponse.json({ error: "Server configuration error." }, { status: 500 });
  }

  const limit = await checkAuthRateLimit(buckets);
  if (limit.locked) {
    return rateLimitedResponse(limit.retryAfterSec);
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
    await registerAuthFailure(buckets);
    return NextResponse.json({ error: GENERIC_PIN_FAILURE }, { status: 401 });
  }

  // A matching PIN is not sufficient: roles that must hold an email/password account may never
  // mint a session from a shared-device PIN, however the digest came to exist. This is checked
  // before any token is created, and the response is identical to a wrong PIN so the caller
  // cannot learn that the submitted value belongs to a high-authority Employee.
  if (!mayAuthenticateWithQuickPin(employee.roleType)) {
    await registerAuthFailure(buckets);
    await prisma.employeeHrAuditLog.create({
      data: {
        facilityId: employee.facilityId,
        employeeId: employee.id,
        userId: null,
        fieldKey: "auth.quickPin.rejectedPasswordRequiredRole",
        oldValue: employee.roleType,
        newValue: "rejected",
      },
    });
    return NextResponse.json({ error: GENERIC_PIN_FAILURE }, { status: 401 });
  }

  // Clears only the bucket this credential owns. The facility-wide bucket is left intact so one
  // valid login cannot wipe out evidence of concurrent guessing at the same facility.
  await resetAuthRateLimitBucket(candidateBucketKey);

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
          clientIp: clientIpLabel(request),
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
    authMethod: "QUICK_PIN",
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
