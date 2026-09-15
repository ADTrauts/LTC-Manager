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

/**
 * Default sign-in preference when creating an employee.
 * Email/password and PIN are independent — this only sets the create-flow default.
 */
export function defaultAccessMethodForRole(role: RoleKey): AccessMethod {
  return requiresEmailPasswordAccount(role) ? "EMAIL_PASSWORD" : "PIN_ONLY";
}

/**
 * Every RoleKey may authenticate with Quick PIN.
 * Email/password and PIN are independent; platform authority does not gate PIN eligibility.
 */
export const QUICK_PIN_ELIGIBLE_ROLES: readonly RoleKey[] = Object.values(RoleKey);

/**
 * Canonical server-side answer to "may this Employee role authenticate using Quick PIN?".
 *
 * Accepts unknown input because role values reach this check from persisted rows and request
 * payloads; anything that is not a known RoleKey is denied.
 */
export function mayAuthenticateWithQuickPin(role: unknown): role is RoleKey {
  return typeof role === "string" && (QUICK_PIN_ELIGIBLE_ROLES as readonly string[]).includes(role);
}
