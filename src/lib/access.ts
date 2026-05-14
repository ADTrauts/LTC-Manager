/** App roles: STAFF = Team Member (operational floor role). */
export const APP_ROLES = [
  "GM",
  "MANAGER",
  "SUPERVISOR",
  "LEAD_TEAM_MEMBER",
  "STAFF",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Higher number = more authority. */
export const ROLE_PRIORITY: Record<AppRole, number> = {
  GM: 5,
  MANAGER: 4,
  SUPERVISOR: 3,
  LEAD_TEAM_MEMBER: 2,
  STAFF: 1,
};

export function hasAtLeastRole(role: AppRole, min: AppRole): boolean {
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY[min];
}

export function requireAtLeastRole(role: AppRole, min: AppRole): void {
  if (!hasAtLeastRole(role, min)) {
    throw new Error("Insufficient permissions.");
  }
}
