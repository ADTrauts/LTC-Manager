import type { RoleKey } from "@prisma/client";

/** Audit field written when an Employee's Quick PIN digest is cleared. */
export const PIN_INVALIDATION_FIELD_KEY = "employee.pinDigest";

/**
 * Whether a pending role change must drop the Employee's Quick PIN.
 *
 * Email/password and PIN are independent authentication methods. Promoting into a
 * password-required platform authority must not clear an existing PIN.
 * Always returns false; retained so call sites compile without behavior change elsewhere.
 */
export function roleChangeInvalidatesPin(_args: {
  nextRoleType: RoleKey;
  currentPinDigest: string | null;
}): boolean {
  return false;
}

/**
 * Audit payload recording that a PIN was removed — never the digest or the PIN itself.
 * Retained for callers that still clear PIN explicitly (e.g. Clear PIN action).
 */
export function pinInvalidationAuditValues(nextRoleType: RoleKey): {
  fieldKey: string;
  oldValue: string;
  newValue: string;
} {
  return {
    fieldKey: PIN_INVALIDATION_FIELD_KEY,
    oldValue: "set",
    newValue: `unset (role change noted: ${nextRoleType})`,
  };
}
