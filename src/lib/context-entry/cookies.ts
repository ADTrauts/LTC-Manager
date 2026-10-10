import { getCookieOptions, SESSION_COOKIE, type AppJwtPayload } from "@/lib/auth";
import { ACTIVE_DEPARTMENT_COOKIE } from "@/lib/department-nav";
import { DEVICE_FACILITY_COOKIE, getDeviceCookieOptions } from "@/lib/device-cookie";
import { PARTNER_ACTIVE_DEPARTMENT_COOKIE } from "@/lib/partner-operational-context";

import type { ContextKeyKind } from "./types";

type CookieSetOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
  maxAge?: number;
};

export type CookieWriter = {
  set: (name: string, value: string, options?: CookieSetOptions) => void;
};

export type ContextCookieSource = {
  session: AppJwtPayload | null;
  internalDepartmentId?: string | null;
  partnerDepartmentId?: string | null;
  internalDepartmentCarryover?: string | null;
};

export type ContextCookieDestination = {
  kind: ContextKeyKind | "account";
  token: string;
  facilityId?: string;
  facilityPartnerOrganizationId?: string;
  allowedDepartmentIds?: string[];
};

function isInternalSource(session: AppJwtPayload | null): boolean {
  return Boolean(
    session &&
      session.scopeKind === "facility" &&
      session.accessKind !== "partner" &&
      session.authKind === "user" &&
      session.role,
  );
}

function isPartnerSource(session: AppJwtPayload | null): session is AppJwtPayload & {
  accessKind: "partner";
  facilityPartnerOrganizationId: string;
} {
  return Boolean(
    session &&
      session.scopeKind === "facility" &&
      session.accessKind === "partner" &&
      session.facilityPartnerOrganizationId,
  );
}

function clearCookie(jar: CookieWriter, name: string): void {
  jar.set(name, "", { ...getCookieOptions(), maxAge: 0 });
}

/**
 * Replace `ltc_session` and drop context cookies that must not cross kinds.
 * Device Facility / unit cookies stay on the PIN/device plane unless entering internal.
 */
export function applyContextTransitionCookies(
  jar: CookieWriter,
  destination: ContextCookieDestination,
  source: ContextCookieSource = { session: null },
): void {
  jar.set(SESSION_COOKIE, destination.token, getCookieOptions());

  if (destination.kind === "facility_partner") {
    const samePartnership =
      isPartnerSource(source.session) &&
      source.session.facilityPartnerOrganizationId === destination.facilityPartnerOrganizationId;
    const requested = source.partnerDepartmentId?.trim() || null;
    const allowed = destination.allowedDepartmentIds ?? [];
    const reuse = samePartnership && requested && allowed.includes(requested) ? requested : null;
    if (reuse) {
      jar.set(PARTNER_ACTIVE_DEPARTMENT_COOKIE, reuse, getCookieOptions());
    } else {
      clearCookie(jar, PARTNER_ACTIVE_DEPARTMENT_COOKIE);
    }
  } else {
    clearCookie(jar, PARTNER_ACTIVE_DEPARTMENT_COOKIE);
  }

  if (destination.kind === "facility_internal") {
    if (isInternalSource(source.session) && source.internalDepartmentCarryover) {
      jar.set(ACTIVE_DEPARTMENT_COOKIE, source.internalDepartmentCarryover, getCookieOptions());
    } else {
      clearCookie(jar, ACTIVE_DEPARTMENT_COOKIE);
    }
    if (destination.facilityId) {
      jar.set(DEVICE_FACILITY_COOKIE, destination.facilityId, getDeviceCookieOptions());
    }
  } else {
    clearCookie(jar, ACTIVE_DEPARTMENT_COOKIE);
  }
}

export function applyAccountSessionCookies(jar: CookieWriter, token: string): void {
  applyContextTransitionCookies(jar, { kind: "account", token });
}
