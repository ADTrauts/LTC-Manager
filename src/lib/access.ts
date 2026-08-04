/** App roles: FACILITY_ADMINISTRATOR tops org-wide admin; GM = department-head tier at facility level enum (scoped by roster in product rules). STAFF = Team Member. */
export const APP_ROLES = [
  "FACILITY_ADMINISTRATOR",
  "GM",
  "MANAGER",
  "SUPERVISOR",
  "LEAD_TEAM_MEMBER",
  "STAFF",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Higher number = more authority. */
export const ROLE_PRIORITY: Record<AppRole, number> = {
  FACILITY_ADMINISTRATOR: 6,
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

/** All role keys in priority order (highest first) for iteration. */
export function allAppRolesDescending(): AppRole[] {
  return [...APP_ROLES].sort((a, b) => ROLE_PRIORITY[b] - ROLE_PRIORITY[a]);
}
