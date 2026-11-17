import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const HARBOR_SESSION_COOKIE = "harbor_session";
export const HARBOR_WORK_COOKIE = "harbor_work";
export const HARBOR_WORK_CLEANUP_PATH = "/console/work-session-ended";
export const HARBOR_TOKEN_USE = "harbor";
export const HARBOR_STAFF_LOGIN_TOKEN_USE = "harbor_staff_login";
export const HARBOR_WORK_TOKEN_USE = "harbor_work";
export const HARBOR_SESSION_TTL_SECONDS = 60 * 60 * 12;
export const HARBOR_JWT_CLOCK_TOLERANCE_SECONDS = 0;
export const HARBOR_INITIAL_SESSION_VERSION = 0;
export const HARBOR_LOGIN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type HarborStaffRole = "OWNER" | "MEMBER";

export type HarborJwtPayload = JWTPayload & {
  uid: string;
  tokenUse: typeof HARBOR_TOKEN_USE | typeof HARBOR_STAFF_LOGIN_TOKEN_USE;
  email: string;
  name: string;
  staffRole: HarborStaffRole;
  sessionVersion: number;
  staffMfa?: true;
};

function getJwtSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required");
  }
  return new TextEncoder().encode(secret);
}

export function getHarborCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: HARBOR_SESSION_TTL_SECONDS,
  };
}

export async function createHarborSessionToken(input: {
  uid: string;
  email: string;
  name: string;
  staffRole: HarborStaffRole;
  sessionVersion: number;
}, options?: { bindAssistance?: true; mfaVerified?: true }) {
  const token = new SignJWT({
    uid: input.uid,
    // A pre-1C build cannot accept a new ordinary login or mistake it for an assistance login.
    tokenUse: options?.bindAssistance ? HARBOR_TOKEN_USE : HARBOR_STAFF_LOGIN_TOKEN_USE,
    authKind: "harbor_staff",
    email: input.email,
    name: input.name,
    staffRole: input.staffRole,
    sessionVersion: input.sessionVersion,
    ...(options?.mfaVerified && { staffMfa: true }),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${HARBOR_SESSION_TTL_SECONDS}s`)
    .setJti(crypto.randomUUID());
  return token.sign(getJwtSecret());
}

export type HarborWorkJwtPayload = JWTPayload & {
  tokenUse: typeof HARBOR_WORK_TOKEN_USE;
  staffId: string;
  facilityId: string;
};

/** Decode retired work tokens only for remaining Console denial checks. */
export async function verifyHarborWorkToken(token: string): Promise<HarborWorkJwtPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  const p = payload as Record<string, unknown>;
  if (p.tokenUse !== HARBOR_WORK_TOKEN_USE) {
    throw new Error("Not a Harbor work session.");
  }
  const staffId = String(p.staffId ?? "");
  const facilityId = String(p.facilityId ?? "");
  if (!staffId || !facilityId) {
    throw new Error("Harbor work session is missing a facility.");
  }
  return {
    ...payload,
    tokenUse: HARBOR_WORK_TOKEN_USE,
    staffId,
    facilityId,
  };
}

export async function verifyHarborSessionToken(token: string): Promise<HarborJwtPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    clockTolerance: HARBOR_JWT_CLOCK_TOLERANCE_SECONDS,
  });
  const p = payload as Record<string, unknown>;
  const tokenUse = p.tokenUse;
  if (tokenUse !== HARBOR_TOKEN_USE && tokenUse !== HARBOR_STAFF_LOGIN_TOKEN_USE) {
    throw new Error("Not a Harbor session.");
  }
  const staffRole = p.staffRole === "OWNER" || p.staffRole === "MEMBER" ? p.staffRole : null;
  if (!staffRole) {
    throw new Error("Harbor session is missing a staff role.");
  }
  if (typeof p.sessionVersion !== "number") {
    throw new Error("Harbor session is missing a version.");
  }
  return {
    ...payload,
    uid: String(p.uid ?? ""),
    tokenUse,
    email: String(p.email ?? ""),
    name: String(p.name ?? ""),
    staffRole,
    sessionVersion: p.sessionVersion,
  };
}
