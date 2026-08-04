import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";

import type { AppRole } from "@/lib/access";

export const SESSION_COOKIE = "ltc_session";

export type AuthKind = "user" | "employee";

/** How the session was established. Records provenance only; it never grants authority. */
export const authMethodValues = ["PASSWORD", "QUICK_PIN"] as const;
export type AuthMethod = (typeof authMethodValues)[number];

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

const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type AppJwtPayload = JWTPayload & {
  uid: string;
  authKind: AuthKind;
  /** Credential surface used at login. Authorization still derives from `role` and relationships. */
  authMethod: AuthMethod;
  role: AppRole;
  name: string;
  email: string;
  facilityId: string;
  activeUnitId?: string | null;
  /** When set, department-scoped lists default to this department (user or employee primary). */
  primaryDepartmentId?: string | null;
  /** Set when PIN login used a unit-locked tablet the employee is not assigned to (see `EmployeeUnitAccess`). */
  kioskUnitAccessWarning?: boolean;
};

function getJwtSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required");
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: {
  uid: string;
  authKind?: AuthKind;
  authMethod?: AuthMethod;
  role: AppRole;
  name: string;
  email: string;
  facilityId: string;
  activeUnitId?: string | null;
  primaryDepartmentId?: string | null;
  kioskUnitAccessWarning?: boolean;
}) {
  const authKind = payload.authKind ?? "user";
  const body: Record<string, unknown> = {
    uid: payload.uid,
    authKind,
    authMethod: resolveAuthMethod(payload.authMethod, authKind),
    role: payload.role,
    name: payload.name,
    email: payload.email,
    facilityId: payload.facilityId,
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

export async function verifySessionToken(token: string): Promise<AppJwtPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  const p = payload as Record<string, unknown>;
  const authKind = (p.authKind as AuthKind | undefined) ?? "user";
  return {
    ...payload,
    uid: String(p.uid ?? ""),
    authKind,
    authMethod: resolveAuthMethod(p.authMethod, authKind),
    role: p.role as AppRole,
    name: String(p.name ?? ""),
    email: String(p.email ?? ""),
    facilityId: String(p.facilityId ?? ""),
    activeUnitId: (p.activeUnitId as string | undefined) ?? undefined,
    primaryDepartmentId: (p.primaryDepartmentId as string | undefined) ?? undefined,
    kioskUnitAccessWarning: p.kioskUnitAccessWarning === true,
  } as AppJwtPayload;
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

export async function getSession(): Promise<AppJwtPayload | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;

  if (!raw) {
    return null;
  }

  try {
    const payload = await verifySessionToken(raw);
    if (!payload.facilityId) {
      return null;
    }
    return {
      ...payload,
      authKind: payload.authKind ?? "user",
    };
  } catch {
    return null;
  }
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
