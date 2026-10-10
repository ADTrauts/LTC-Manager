import { cookies } from "next/headers";

import {
  getAppSession,
  isAccountSession,
  isFacilityScopedSession,
  isOrganizationScopedSession,
  isPartnerFacilitySession,
  SESSION_COOKIE,
  verifySessionToken,
  type AccountSession,
  type AppJwtPayload,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AuthenticatedUserScopeKind =
  | "account"
  | "organization"
  | "facility_internal"
  | "facility_partner";

export type AuthenticatedUserSession = {
  uid: string;
  sessionVersion: number;
  name: string;
  email: string;
  scopeKind: AuthenticatedUserScopeKind;
};

export type UserIdentity = {
  uid: string;
  sessionVersion: number;
  name: string;
  email: string;
  session: AppJwtPayload;
};

export type UserIdentityRead =
  | { ok: true; identity: UserIdentity }
  | {
      ok: false;
      reason: "UNAUTHENTICATED" | "NOT_USER" | "USER_NOT_FOUND" | "USER_INACTIVE" | "SESSION_VERSION_STALE";
    };

function userScopeKind(session: AppJwtPayload): AuthenticatedUserScopeKind | null {
  if (isAccountSession(session)) return "account";
  if (isOrganizationScopedSession(session)) return "organization";
  if (isPartnerFacilitySession(session)) return "facility_partner";
  if (isFacilityScopedSession(session) && session.authKind === "user") return "facility_internal";
  return null;
}

function toAuthenticatedUserSession(session: AppJwtPayload): AuthenticatedUserSession | null {
  if (session.authKind !== "user") return null;
  const scopeKind = userScopeKind(session);
  if (!scopeKind) return null;
  if (typeof session.sessionVersion !== "number") return null;
  return {
    uid: session.uid,
    sessionVersion: session.sessionVersion,
    name: session.name,
    email: session.email,
    scopeKind,
  };
}

/**
 * Any currently valid User session: account, Organization, internal Facility, or partner.
 * Rejects PIN (`authKind: "employee"`) and Harbor / PlatformStaff.
 */
export async function getAuthenticatedUserSession(): Promise<AuthenticatedUserSession | null> {
  const session = await getAppSession();
  if (!session) return null;
  return toAuthenticatedUserSession(session);
}

export async function requireAuthenticatedUserSession(): Promise<AuthenticatedUserSession> {
  const session = await getAuthenticatedUserSession();
  if (!session) {
    throw new Error("Unauthorized.");
  }
  return session;
}

export async function requireAccountSession(): Promise<AccountSession> {
  const session = await getAppSession();
  if (!session || !isAccountSession(session)) {
    throw new Error("Unauthorized.");
  }
  return session;
}

/**
 * Signature + User identity only. Does not require the current workspace relationship
 * to still be valid. Used by context entry and account recovery.
 */
export async function readAuthenticatedUserIdentity(): Promise<UserIdentityRead> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) {
    return { ok: false, reason: "UNAUTHENTICATED" };
  }

  let session: AppJwtPayload;
  try {
    session = await verifySessionToken(raw);
  } catch {
    return { ok: false, reason: "UNAUTHENTICATED" };
  }

  if (session.authKind !== "user") {
    return { ok: false, reason: "NOT_USER" };
  }

  if (typeof session.sessionVersion !== "number") {
    return { ok: false, reason: "SESSION_VERSION_STALE" };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: {
      id: true,
      isActive: true,
      sessionVersion: true,
      displayName: true,
      email: true,
    },
  });
  if (!user) {
    return { ok: false, reason: "USER_NOT_FOUND" };
  }
  if (!user.isActive) {
    return { ok: false, reason: "USER_INACTIVE" };
  }
  if (user.sessionVersion !== session.sessionVersion) {
    return { ok: false, reason: "SESSION_VERSION_STALE" };
  }

  return {
    ok: true,
    identity: {
      uid: user.id,
      sessionVersion: user.sessionVersion,
      name: user.displayName,
      email: user.email ?? session.email,
      session,
    },
  };
}
