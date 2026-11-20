import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  HARBOR_SESSION_COOKIE,
  HARBOR_WORK_COOKIE,
  type HarborJwtPayload,
  type HarborStaffRole,
  verifyHarborSessionToken,
  verifyHarborWorkToken,
} from "@/lib/harbor-console/session";
import { prisma } from "@/lib/prisma";
import { harborLoginIdentity, hasHarborLogoutReceipt } from "./login-receipt";
import { staffLifecycleRequested } from "./lifecycle/gate";

export {
  createHarborSessionToken,
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

const HARBOR_CAPABILITY_ROLES = {
  "catalog.publish": ["OWNER"],
} satisfies Record<string, readonly HarborStaffRole[]>;

export type HarborCapability = keyof typeof HARBOR_CAPABILITY_ROLES;

/** Apply capability policy to a session resolved by the Harbor server. */
export function hasHarborCapability(
  capability: HarborCapability,
  session: Pick<HarborJwtPayload, "staffRole"> | null,
): boolean {
  const roles: readonly HarborStaffRole[] = HARBOR_CAPABILITY_ROLES[capability];
  return session !== null && roles.includes(session.staffRole);
}

export async function validateHarborStaffSession(
  session: HarborJwtPayload,
  db: Pick<Prisma.TransactionClient, "platformStaff" | "harborAssistanceLoginReceipt"> = prisma,
) {
  const login = harborLoginIdentity(session);
  if (!login || login.retainUntil.getTime() <= Date.now()) return { valid: false as const };
  if (staffLifecycleRequested() && session.staffMfa !== true) return { valid: false as const };
  const staff = await db.platformStaff.findUnique({
    where: { id: session.uid },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      isActive: true,
      sessionVersion: true,
      _count: { select: { lifecyclePasskeys: true } },
    },
  });
  if (!staff || !staff.isActive) {
    return { valid: false as const };
  }
  // Once enrolled, a staff identity cannot fall back to password-only authority when issuance is paused.
  if (staff._count.lifecyclePasskeys > 0 && session.staffMfa !== true) return { valid: false as const };
  if (staff.sessionVersion !== session.sessionVersion) {
    return { valid: false as const };
  }
  if (staff.role !== session.staffRole || staff.email !== session.email) {
    return { valid: false as const };
  }
  if (await hasHarborLogoutReceipt(db, login.key) || login.retainUntil.getTime() <= Date.now()) {
    return { valid: false as const };
  }
  return { valid: true as const, staff };
}

/** Recheck live authority and hold it stable through a protected write. */
export async function lockHarborStaffSession(session: HarborJwtPayload, tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT "id" FROM "PlatformStaff" WHERE "id" = ${session.uid} FOR SHARE`;
  return validateHarborStaffSession(session, tx);
}

export async function resolveHarborSession(raw: string | undefined): Promise<HarborJwtPayload | null> {
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

export async function getHarborSession(): Promise<HarborJwtPayload | null> {
  return resolveHarborSession((await cookies()).get(HARBOR_SESSION_COOKIE)?.value);
}

export async function requireHarborStaff() {
  const session = await getHarborSession();
  if (!session) {
    redirect("/console/login");
  }
  return session;
}

export function isHarborOwnerSession(
  session: Pick<HarborJwtPayload, "staffRole"> | null | undefined,
): boolean {
  return session?.staffRole === "OWNER";
}

export async function requireHarborOwner() {
  const session = await requireHarborStaff();
  if (!isHarborOwnerSession(session)) {
    redirect("/console/customers");
  }
  return session;
}

/** Deny-only legacy context for Implementation and Support. */
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
