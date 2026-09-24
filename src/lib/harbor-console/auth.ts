import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  HARBOR_SESSION_COOKIE,
  HARBOR_WORK_COOKIE,
  type HarborJwtPayload,
  verifyHarborSessionToken,
  verifyHarborWorkToken,
} from "@/lib/harbor-console/session";
import { prisma } from "@/lib/prisma";

export {
  createHarborSessionToken,
  createHarborWorkToken,
  getHarborCookieOptions,
  HARBOR_INITIAL_SESSION_VERSION,
  HARBOR_SESSION_COOKIE,
  HARBOR_WORK_COOKIE,
  HARBOR_TOKEN_USE,
  HARBOR_WORK_TOKEN_USE,
  verifyHarborSessionToken,
  verifyHarborWorkToken,
  type HarborJwtPayload,
  type HarborStaffRole,
  type HarborWorkJwtPayload,
} from "@/lib/harbor-console/session";

export async function validateHarborStaffSession(session: HarborJwtPayload) {
  const staff = await prisma.platformStaff.findUnique({
    where: { id: session.uid },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      isActive: true,
      sessionVersion: true,
    },
  });
  if (!staff || !staff.isActive) {
    return { valid: false as const };
  }
  if (staff.sessionVersion !== session.sessionVersion) {
    return { valid: false as const };
  }
  if (staff.role !== session.staffRole || staff.email !== session.email) {
    return { valid: false as const };
  }
  return { valid: true as const, staff };
}

export async function getHarborSession(): Promise<HarborJwtPayload | null> {
  const jar = await cookies();
  const raw = jar.get(HARBOR_SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }
  try {
    const payload = await verifyHarborSessionToken(raw);
    const authority = await validateHarborStaffSession(payload);
    if (!authority.valid) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function requireHarborStaff() {
  const session = await getHarborSession();
  if (!session) {
    redirect("/console/login");
  }
  return session;
}

export async function peekHarborWorkFacilityId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(HARBOR_WORK_COOKIE)?.value;
  if (!raw) {
    return null;
  }
  try {
    const work = await verifyHarborWorkToken(raw);
    return work.facilityId;
  } catch {
    return null;
  }
}
