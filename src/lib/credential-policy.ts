import { RoleKey } from "@prisma/client";

export const accessMethodValues = ["PIN_ONLY", "EMAIL_PASSWORD"] as const;
export type AccessMethod = (typeof accessMethodValues)[number];

/** App sign-in with email/password is required for these employee role types. */
export function requiresEmailPasswordAccount(role: RoleKey): boolean {
  return (
    role === RoleKey.FACILITY_ADMINISTRATOR ||
    role === RoleKey.GM ||
    role === RoleKey.MANAGER ||
    role === RoleKey.SUPERVISOR
  );
}

export function isLeadershipRole(role: RoleKey): boolean {
  return role === RoleKey.MANAGER || role === RoleKey.SUPERVISOR;
}

export function defaultAccessMethodForRole(role: RoleKey): AccessMethod {
  return requiresEmailPasswordAccount(role) ? "EMAIL_PASSWORD" : "PIN_ONLY";
}

/**
 * Roles that may authenticate with Quick PIN, derived from `requiresEmailPasswordAccount`
 * so there is exactly one source of truth for credential eligibility.
 */
export const QUICK_PIN_ELIGIBLE_ROLES: readonly RoleKey[] = Object.values(RoleKey).filter(
  (role) => !requiresEmailPasswordAccount(role),
);

/**
 * Canonical server-side answer to "may this Employee role authenticate using Quick PIN?".
 *
 * Accepts unknown input because role values reach this check from persisted rows and request
 * payloads; anything not on the eligible list is denied rather than defaulting to allowed.
 */
export function mayAuthenticateWithQuickPin(role: unknown): role is RoleKey {
  return (
    typeof role === "string" && (QUICK_PIN_ELIGIBLE_ROLES as readonly string[]).includes(role)
  );
}
