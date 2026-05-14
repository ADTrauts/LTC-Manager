import { RoleKey } from "@prisma/client";

export const accessMethodValues = ["PIN_ONLY", "EMAIL_PASSWORD"] as const;
export type AccessMethod = (typeof accessMethodValues)[number];

/** App sign-in with email/password is required for these employee role types. */
export function requiresEmailPasswordAccount(role: RoleKey): boolean {
  return role === RoleKey.GM || role === RoleKey.MANAGER || role === RoleKey.SUPERVISOR;
}

export function isLeadershipRole(role: RoleKey): boolean {
  return role === RoleKey.MANAGER || role === RoleKey.SUPERVISOR;
}

export function defaultAccessMethodForRole(role: RoleKey): AccessMethod {
  return requiresEmailPasswordAccount(role) ? "EMAIL_PASSWORD" : "PIN_ONLY";
}
