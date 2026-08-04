import type { RoleKey } from "@prisma/client";

import { mayAuthenticateWithQuickPin } from "@/lib/credential-policy";

/** Audit field written when a role change removes an Employee's Quick PIN. */
export const PIN_INVALIDATION_FIELD_KEY = "employee.pinDigest";

/**
 * Whether a pending role change must drop the Employee's Quick PIN.
 *
 * A PIN issued while an Employee was PIN-eligible must not survive promotion into a role that
 * signs in with email and password, so the same write that raises the role clears the digest.
 * Returns false when there is nothing to clear, so callers do not emit an empty audit entry.
 */
export function roleChangeInvalidatesPin(args: {
  nextRoleType: RoleKey;
  currentPinDigest: string | null;
}): boolean {
  return args.currentPinDigest !== null && !mayAuthenticateWithQuickPin(args.nextRoleType);
}

/**
 * Audit payload recording that credential eligibility changed. Records only that a PIN existed
 * and was removed — never the digest or the PIN itself.
 */
export function pinInvalidationAuditValues(nextRoleType: RoleKey): {
  fieldKey: string;
  oldValue: string;
  newValue: string;
} {
  return {
    fieldKey: PIN_INVALIDATION_FIELD_KEY,
    oldValue: "set",
    newValue: `unset (role now requires email/password: ${nextRoleType})`,
  };
}
