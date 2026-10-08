import type { OrganizationPartnerRole } from "@prisma/client";

/**
 * Explicit partner-role rank. Do not sort the Prisma enum, database enum order,
 * or role name strings. Alphabetical order is the opposite of authority
 * (PARTNER_MANAGER sorts before PARTNER_OPERATOR).
 */
const PARTNER_ROLE_RANK: Record<OrganizationPartnerRole, number> = {
  PARTNER_VIEWER: 1,
  PARTNER_OPERATOR: 2,
  PARTNER_MANAGER: 3,
};

export function partnerRoleRank(role: OrganizationPartnerRole): number {
  const rank = PARTNER_ROLE_RANK[role];
  if (rank === undefined) {
    throw new Error(`Unknown partner role: ${String(role)}`);
  }
  return rank;
}

/** Negative when `left` is below `right`, zero when equal, positive when `left` is above `right`. */
export function comparePartnerRoles(
  left: OrganizationPartnerRole,
  right: OrganizationPartnerRole,
): number {
  return partnerRoleRank(left) - partnerRoleRank(right);
}

export function minPartnerRole(
  left: OrganizationPartnerRole,
  right: OrganizationPartnerRole,
): OrganizationPartnerRole {
  return comparePartnerRoles(left, right) <= 0 ? left : right;
}

export function isPartnerRoleAtOrBelow(
  role: OrganizationPartnerRole,
  ceiling: OrganizationPartnerRole,
): boolean {
  return partnerRoleRank(role) <= partnerRoleRank(ceiling);
}

/** Roles a Facility may grant under a ceiling, ordered by explicit rank. */
export function partnerRolesAtOrBelow(
  ceiling: OrganizationPartnerRole,
): OrganizationPartnerRole[] {
  return (Object.keys(PARTNER_ROLE_RANK) as OrganizationPartnerRole[])
    .filter((role) => isPartnerRoleAtOrBelow(role, ceiling))
    .sort((left, right) => partnerRoleRank(left) - partnerRoleRank(right));
}

export function partnerRoleLabel(role: OrganizationPartnerRole): string {
  switch (role) {
    case "PARTNER_VIEWER":
      return "Partner Viewer";
    case "PARTNER_OPERATOR":
      return "Partner Operator";
    case "PARTNER_MANAGER":
      return "Partner Manager";
  }
}
