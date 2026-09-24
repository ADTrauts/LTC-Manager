/** Default landing after Harbor staff open a customer facility. */
export const HARBOR_WORK_DEFAULT_PATH = "/admin/facility/builder";

/**
 * Surfaces Harbor staff may use while remaining PlatformStaff.
 * Prefix match is exact or `prefix/` — `/build` is not `/build/logs`.
 */
const ALLOWED_PREFIXES = [
  "/admin/facility/builder",
  "/admin/departments",
  "/employees",
  "/assets",
  "/build/logs",
  "/api/attachments",
  "/api/auth/session",
  "/api/auth/active-department",
] as const;

/** Never reachable in a work session, even if a page under an allowed prefix linked here. */
const DENIED_PREFIXES = [
  "/admin/billing",
  "/api/billing",
  "/setup",
  "/api/onboarding",
  "/api/auth/bind-device",
  "/api/auth/logout-full",
  "/api/auth/switch-facility",
  "/account",
] as const;

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isHarborWorkPathAllowed(pathname: string): boolean {
  if (DENIED_PREFIXES.some((prefix) => pathMatchesPrefix(pathname, prefix))) {
    return false;
  }
  return ALLOWED_PREFIXES.some((prefix) => pathMatchesPrefix(pathname, prefix));
}

export function harborWorkCustomerPath(facilityId: string): string {
  return `/console/customers/${facilityId}`;
}
