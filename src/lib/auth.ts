import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";

import type { AppRole } from "@/lib/access";

export const SESSION_COOKIE = "ltc_session";

export type AuthKind = "user" | "employee" | "harbor_staff";

/** How the session was established. Records provenance only; it never grants authority. */
export const authMethodValues = ["PASSWORD", "QUICK_PIN"] as const;
export type AuthMethod = (typeof authMethodValues)[number];

/**
 * Explicit session context discriminant (Phase 2B1).
 * Facility sessions carry Facility RoleKey + active Facility.
 * Organization sessions carry selected Organization context only — authority is re-checked server-side.
 */
export type SessionScopeKind = "facility" | "organization";

/**
 * Cookies issued before the `authMethod` claim existed do not carry it. Those sessions are read
 * as PASSWORD for `authKind: "user"` and QUICK_PIN for `authKind: "employee"`, which matches how
 * each kind was always created, so existing sessions stay valid across this release.
 */
function resolveAuthMethod(raw: unknown, authKind: AuthKind): AuthMethod {
  if (typeof raw === "string" && (authMethodValues as readonly string[]).includes(raw)) {
    return raw as AuthMethod;
  }
  return authKind === "employee" ? "QUICK_PIN" : "PASSWORD";
}

function resolveScopeKind(
  raw: unknown,
  facilityId: string | undefined,
  organizationId: string | undefined,
): SessionScopeKind {
  if (raw === "organization") return "organization";
  if (raw === "facility") return "facility";
  // Pre-2B1 tokens: facilityId present ⇒ facility scope.
  if (facilityId) return "facility";
  if (organizationId) return "organization";
  return "facility";
}

const SESSION_TTL_SECONDS = 60 * 60 * 12;

type AppJwtCommon = JWTPayload & {
  uid: string;
  authKind: AuthKind;
  authMethod: AuthMethod;
  name: string;
  email: string;
  activeUnitId?: string | null;
  primaryDepartmentId?: string | null;
  kioskUnitAccessWarning?: boolean;
  sessionVersion?: number;
};

/**
 * Active internal Facility session. `facilityId` is the active (session) Facility, not home Facility.
 * Facility RoleKey is required. A partner Facility session is a different type and does not satisfy this.
 */
export type FacilitySession = AppJwtCommon & {
  scopeKind: "facility";
  /** Absent on tokens issued before partner sessions. Never "partner". */
  accessKind?: undefined;
  role: AppRole;
  facilityId: string;
  organizationId?: string;
};

/**
 * External Facility context for a User acting under one partnership.
 * The token names the context only. Role, ceiling, and Department scope are reloaded from Path B.
 */
export type PartnerFacilitySession = AppJwtCommon & {
  scopeKind: "facility";
  accessKind: "partner";
  authKind: "user";
  facilityId: string;
  partnerOrganizationId: string;
  facilityPartnerOrganizationId: string;
  role?: undefined;
  organizationId?: undefined;
  primaryDepartmentId?: undefined;
};

/** Organization-scoped session. No Facility RoleKey; authority is membership periods. */
export type OrganizationSessionPayload = AppJwtCommon & {
  scopeKind: "organization";
  organizationId: string;
  role?: undefined;
  facilityId?: undefined;
};

export type AppJwtPayload = FacilitySession | OrganizationSessionPayload | PartnerFacilitySession;

export function isFacilityScopedSession(
  session: Pick<AppJwtPayload, "scopeKind" | "facilityId" | "role">,
): session is FacilitySession {
  return (
    session.scopeKind === "facility" &&
    typeof session.facilityId === "string" &&
    session.facilityId.length > 0 &&
    session.role != null
  );
}

export function isPartnerFacilitySession(
  session: Pick<AppJwtPayload, "scopeKind" | "facilityId"> & {
    accessKind?: string;
    authKind?: AuthKind;
    partnerOrganizationId?: string;
    facilityPartnerOrganizationId?: string;
    role?: AppRole;
  },
): session is PartnerFacilitySession {
  return (
    session.scopeKind === "facility" &&
    session.accessKind === "partner" &&
    session.authKind === "user" &&
    session.role == null &&
    typeof session.facilityId === "string" &&
    session.facilityId.length > 0 &&
    typeof session.partnerOrganizationId === "string" &&
    session.partnerOrganizationId.length > 0 &&
    typeof session.facilityPartnerOrganizationId === "string" &&
    session.facilityPartnerOrganizationId.length > 0
  );
}

export function isOrganizationScopedSession(
  session: Pick<AppJwtPayload, "scopeKind" | "organizationId">,
): session is OrganizationSessionPayload {
  return (
    session.scopeKind === "organization" &&
    typeof session.organizationId === "string" &&
    session.organizationId.length > 0
  );
}

function getJwtSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required");
  }

  return new TextEncoder().encode(secret);
}

/** Mint a facility-scoped session (facility-native Users and Employees). */
export async function createSessionToken(payload: {
  uid: string;
  authKind?: Exclude<AuthKind, "harbor_staff">;
  authMethod?: AuthMethod;
  role: AppRole;
  name: string;
  email: string;
  facilityId: string;
  activeUnitId?: string | null;
  primaryDepartmentId?: string | null;
  kioskUnitAccessWarning?: boolean;
  /** Current `sessionVersion` of the User or Employee this session is being issued for. */
  sessionVersion: number;
}) {
  const authKind = payload.authKind ?? "user";
  if (!payload.facilityId?.trim()) {
    throw new Error("Facility session requires facilityId.");
  }
  const body: Record<string, unknown> = {
    uid: payload.uid,
    authKind,
    authMethod: resolveAuthMethod(payload.authMethod, authKind),
    scopeKind: "facility",
    role: payload.role,
    name: payload.name,
    email: payload.email,
    facilityId: payload.facilityId,
    sessionVersion: payload.sessionVersion,
  };
  if (payload.activeUnitId !== undefined && payload.activeUnitId !== null) {
    body.activeUnitId = payload.activeUnitId;
  }
  if (payload.kioskUnitAccessWarning === true) {
    body.kioskUnitAccessWarning = true;
  }
  if (payload.primaryDepartmentId !== undefined && payload.primaryDepartmentId !== null) {
    body.primaryDepartmentId = payload.primaryDepartmentId;
  }

  return new SignJWT(body)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getJwtSecret());
}

/**
 * Mint a partner Facility session. Context only: no Facility RoleKey, no partner role,
 * no Department ids, and no primaryDepartmentId.
 */
export async function createPartnerFacilitySessionToken(payload: {
  uid: string;
  name: string;
  email: string;
  facilityId: string;
  partnerOrganizationId: string;
  facilityPartnerOrganizationId: string;
  sessionVersion: number;
}) {
  if (payload.uid.trim().length === 0) {
    throw new Error("Partner facility session requires a user.");
  }
  if (!payload.facilityId.trim() || !payload.partnerOrganizationId.trim()) {
    throw new Error("Partner facility session requires a Facility and partner Organization.");
  }
  if (!payload.facilityPartnerOrganizationId.trim()) {
    throw new Error("Partner facility session requires a partnership.");
  }
  const body: Record<string, unknown> = {
    uid: payload.uid,
    authKind: "user",
    authMethod: "PASSWORD",
    scopeKind: "facility",
    accessKind: "partner",
    name: payload.name,
    email: payload.email,
    facilityId: payload.facilityId,
    partnerOrganizationId: payload.partnerOrganizationId,
    facilityPartnerOrganizationId: payload.facilityPartnerOrganizationId,
    sessionVersion: payload.sessionVersion,
  };
  return new SignJWT(body)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getJwtSecret());
}

/** Mint an organization-scoped session (organization-only Users). No Facility RoleKey. */
export async function createOrganizationSessionToken(payload: {
  uid: string;
  authMethod?: AuthMethod;
  name: string;
  email: string;
  organizationId: string;
  sessionVersion: number;
}) {
  if (!payload.organizationId?.trim()) {
    throw new Error("Organization session requires organizationId.");
  }
  const body: Record<string, unknown> = {
    uid: payload.uid,
    authKind: "user",
    authMethod: resolveAuthMethod(payload.authMethod, "user"),
    scopeKind: "organization",
    name: payload.name,
    email: payload.email,
    organizationId: payload.organizationId,
    sessionVersion: payload.sessionVersion,
  };

  return new SignJWT(body)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<AppJwtPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  const p = payload as Record<string, unknown>;
  const authKind = (p.authKind as AuthKind | undefined) ?? "user";
  if (authKind === "harbor_staff") {
    throw new Error("Not a facility session.");
  }
  const facilityIdRaw = typeof p.facilityId === "string" ? p.facilityId : "";
  const organizationIdRaw = typeof p.organizationId === "string" ? p.organizationId : "";
  const facilityId = facilityIdRaw.trim() || undefined;
  const organizationId = organizationIdRaw.trim() || undefined;
  const scopeKind = resolveScopeKind(p.scopeKind, facilityId, organizationId);
  const role =
    typeof p.role === "string" && p.role.length > 0 ? (p.role as AppRole) : undefined;

  const common = {
    ...payload,
    uid: String(p.uid ?? ""),
    authKind,
    authMethod: resolveAuthMethod(p.authMethod, authKind),
    name: String(p.name ?? ""),
    email: String(p.email ?? ""),
    activeUnitId: (p.activeUnitId as string | undefined) ?? undefined,
    primaryDepartmentId: (p.primaryDepartmentId as string | undefined) ?? undefined,
    kioskUnitAccessWarning: p.kioskUnitAccessWarning === true,
    // Left undefined rather than defaulted when absent, so `validateSessionAuthority` can tell a
    // pre-Phase-4 token apart from one legitimately issued at version zero.
    sessionVersion: typeof p.sessionVersion === "number" ? p.sessionVersion : undefined,
  };

  if (scopeKind === "organization") {
    if (!organizationId) {
      throw new Error("Organization session requires organizationId.");
    }
    return {
      ...common,
      scopeKind: "organization",
      organizationId,
    };
  }

  if (p.accessKind === "partner") {
    if (authKind !== "user") {
      throw new Error("Partner facility session requires a user.");
    }
    const partnerOrganizationId =
      typeof p.partnerOrganizationId === "string" ? p.partnerOrganizationId.trim() : "";
    const facilityPartnerOrganizationId =
      typeof p.facilityPartnerOrganizationId === "string"
        ? p.facilityPartnerOrganizationId.trim()
        : "";
    if (!facilityId || !partnerOrganizationId || !facilityPartnerOrganizationId) {
      throw new Error("Partner facility session is incomplete.");
    }
    if (role) {
      throw new Error("Partner facility session cannot carry a Facility role.");
    }
    return {
      uid: common.uid,
      authKind: "user",
      authMethod: common.authMethod,
      name: common.name,
      email: common.email,
      sessionVersion: common.sessionVersion,
      iat: payload.iat,
      exp: payload.exp,
      scopeKind: "facility",
      accessKind: "partner",
      facilityId,
      partnerOrganizationId,
      facilityPartnerOrganizationId,
    };
  }

  if (!facilityId || !role) {
    throw new Error("Facility session requires facilityId and role.");
  }
  return {
    ...common,
    scopeKind: "facility",
    facilityId,
    role,
    organizationId,
  };
}

/**
 * Use for Prisma fields that reference `User.id`. PIN sessions use `uid` = Employee id;
 * only email/password sessions have `uid` = User id.
 */
export function sessionUserIdForFk(session: AppJwtPayload): string | null {
  if (session.authKind !== "user" || !session.uid) {
    return null;
  }
  return session.uid;
}

/**
 * Any authenticated app session (Facility or Organization).
 * Prefer `getSession` for Facility App code paths.
 */
export async function getAppSession(): Promise<AppJwtPayload | null> {
  const jar = await cookies();

  try {
    const { tryResolveHarborWorkAppSession } = await import("@/lib/harbor-console/work-session");
    const workSession = await tryResolveHarborWorkAppSession((name) => jar.get(name)?.value);
    if (workSession) {
      const { validateSessionForRequest } = await import("@/lib/session-revocation");
      const authority = await validateSessionForRequest(workSession);
      if (authority.valid && isFacilityScopedSession(workSession)) {
        return {
          ...workSession,
          authKind: "harbor_staff",
          scopeKind: "facility",
          primaryDepartmentId: undefined,
        };
      }
    }
  } catch {
    // Work cookies that cannot be read must not block a facility session on the same browser.
  }

  const raw = jar.get(SESSION_COOKIE)?.value;

  if (!raw) {
    return null;
  }

  try {
    const payload = await verifySessionToken(raw);
    if (
      payload.scopeKind === "facility" &&
      !isFacilityScopedSession(payload) &&
      !isPartnerFacilitySession(payload)
    ) {
      return null;
    }
    if (payload.scopeKind === "organization" && !isOrganizationScopedSession(payload)) {
      return null;
    }

    // Every caller of `getAppSession` — pages, API routes, and Server Actions alike — reaches current
    // authority through this one check, so a revoked session cannot be used to read or write
    // protected data even on a path that never passes through the proxy. Memoized per request.
    const { validateSessionForRequest } = await import("@/lib/session-revocation");
    const authority = await validateSessionForRequest(payload);
    if (!authority.valid) {
      return null;
    }

    if (isPartnerFacilitySession(payload)) {
      return {
        uid: payload.uid,
        authKind: "user",
        authMethod: payload.authMethod,
        name: payload.name,
        email: payload.email,
        sessionVersion: payload.sessionVersion,
        iat: payload.iat,
        exp: payload.exp,
        scopeKind: "facility",
        accessKind: "partner",
        facilityId: payload.facilityId,
        partnerOrganizationId: payload.partnerOrganizationId,
        facilityPartnerOrganizationId: payload.facilityPartnerOrganizationId,
      };
    }

    if (payload.scopeKind === "organization") {
      return {
        ...payload,
        authKind: payload.authKind ?? "user",
        primaryDepartmentId: undefined,
      };
    }

    return {
      ...payload,
      authKind: payload.authKind ?? "user",
      // Department authority the identity no longer holds never reaches the caller.
      primaryDepartmentId: authority.effectiveDepartmentId ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Facility App session helper.
 * Returns null for missing/invalid sessions and for Organization-scoped sessions so Facility
 * runtime code can rely on required `facilityId` + Facility RoleKey without unsafe assertions.
 */
export async function getSession(): Promise<FacilitySession | null> {
  const session = await getAppSession();
  if (!session || !isFacilityScopedSession(session)) {
    return null;
  }
  return session;
}

/** Partner Facility session only. Internal Facility sessions and Organization sessions return null. */
export async function getPartnerFacilitySession(): Promise<PartnerFacilitySession | null> {
  const session = await getAppSession();
  if (!session || !isPartnerFacilitySession(session)) {
    return null;
  }
  return session;
}

export async function requirePartnerFacilitySession(): Promise<PartnerFacilitySession> {
  const session = await getPartnerFacilitySession();
  if (!session) {
    throw new Error("Unauthorized.");
  }
  return session;
}

export function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
