import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { AppJwtPayload } from "@/lib/auth";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { prisma } from "@/lib/prisma";

export type AssignmentAuthorityDecision = {
  canViewOwn: boolean;
  canViewDepartment: boolean;
  canManage: boolean;
  canConfirm: boolean;
  canReopen: boolean;
  canOverride: boolean;
  reason: string | null;
};

/**
 * Canonical Phase 7A Assignment authority.
 * Facility Administrator role alone does not grant Dietary Assignment management.
 */
export async function resolveAssignmentAuthority(input: {
  session: AppJwtPayload;
  departmentId: string;
  facilityId: string;
}): Promise<AssignmentAuthorityDecision> {
  const role = input.session.role as AppRole;
  const denied: AssignmentAuthorityDecision = {
    canViewOwn: true,
    canViewDepartment: false,
    canManage: false,
    canConfirm: false,
    canReopen: false,
    canOverride: false,
    reason: "Insufficient Assignment authority.",
  };

  if (input.session.facilityId !== input.facilityId) {
    return { ...denied, canViewOwn: false, reason: "Cross-facility Assignment access denied." };
  }

  const department = await prisma.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
    select: { id: true, key: true },
  });
  if (!department) {
    return { ...denied, canViewOwn: false, reason: "Department not found." };
  }

  // Frontline always may view own confirmed Assignment; never manage.
  if (!hasAtLeastRole(role, "SUPERVISOR")) {
    return {
      canViewOwn: true,
      canViewDepartment: false,
      canManage: false,
      canConfirm: false,
      canReopen: false,
      canOverride: false,
      reason: null,
    };
  }

  // Facility Administrator requires an operational department relationship.
  if (isFacilityAdministratorRole(role)) {
    const user = await prisma.user.findFirst({
      where: { id: input.session.uid, facilityId: input.facilityId, isActive: true },
      select: { primaryDepartmentId: true },
    });
    if (!user || user.primaryDepartmentId !== input.departmentId) {
      return {
        ...denied,
        reason:
          "Facility Administrator status alone does not grant Dietary Assignment authority.",
      };
    }
  }

  const manage = hasAtLeastRole(role, "SUPERVISOR");
  return {
    canViewOwn: true,
    canViewDepartment: manage,
    canManage: manage,
    canConfirm: manage,
    canReopen: manage,
    canOverride: manage,
    reason: null,
  };
}

export function requireAssignmentManage(decision: AssignmentAuthorityDecision): void {
  if (!decision.canManage) {
    throw new Error(decision.reason ?? "Insufficient Assignment authority.");
  }
}
