import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { AppJwtPayload, AuthMethod } from "@/lib/auth";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { isDietaryWorkPlansEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export type WorkAuthorityDecision = {
  canViewRuntime: boolean;
  canComplete: boolean;
  canViewDepartment: boolean;
  canCreateOneOff: boolean;
  canReassign: boolean;
  canMarkNotRequired: boolean;
  canReopen: boolean;
  canManage: boolean;
  canPublish: boolean;
  reason: string | null;
};

const DENIED: WorkAuthorityDecision = {
  canViewRuntime: false,
  canComplete: false,
  canViewDepartment: false,
  canCreateOneOff: false,
  canReassign: false,
  canMarkNotRequired: false,
  canReopen: false,
  canManage: false,
  canPublish: false,
  reason: "Insufficient Department Work authority.",
};

/**
 * Pure authority decision for Dietary Department Work Plans (Phase 11A).
 * Quick PIN may complete frontline Work; never grants Builder / publish.
 * FA alone denied without Dietary operational department relationship.
 */
export function decideWorkAuthority(input: {
  flagEnabled: boolean;
  role: AppRole;
  authMethod: AuthMethod;
  sessionFacilityId: string;
  facilityId: string;
  departmentId: string;
  departmentExists: boolean;
  primaryDepartmentId: string | null | undefined;
}): WorkAuthorityDecision {
  if (!input.flagEnabled) {
    return { ...DENIED, reason: "Dietary Work Plans are not enabled." };
  }

  if (input.sessionFacilityId !== input.facilityId) {
    return { ...DENIED, reason: "Cross-facility Work access denied." };
  }

  if (!input.departmentExists) {
    return { ...DENIED, reason: "Department not found." };
  }

  if (isFacilityAdministratorRole(input.role)) {
    if (input.primaryDepartmentId !== input.departmentId) {
      return {
        ...DENIED,
        reason:
          "Facility Administrator status alone does not grant Dietary Work Plan or operational Work authority.",
      };
    }
  }

  const pinBlocksBuild = input.authMethod === "QUICK_PIN";

  if (!hasAtLeastRole(input.role, "SUPERVISOR")) {
    return {
      canViewRuntime: true,
      canComplete: true,
      canViewDepartment: false,
      canCreateOneOff: false,
      canReassign: false,
      canMarkNotRequired: false,
      canReopen: false,
      canManage: false,
      canPublish: false,
      reason: null,
    };
  }

  const canManage = !pinBlocksBuild && hasAtLeastRole(input.role, "MANAGER");
  const canPublish = canManage;

  if (hasAtLeastRole(input.role, "SUPERVISOR") && !canManage) {
    return {
      canViewRuntime: true,
      canComplete: true,
      canViewDepartment: true,
      canCreateOneOff: !pinBlocksBuild,
      canReassign: !pinBlocksBuild,
      canMarkNotRequired: !pinBlocksBuild,
      canReopen: !pinBlocksBuild,
      canManage: false,
      canPublish: false,
      reason: pinBlocksBuild
        ? "Quick PIN does not grant Work Plan Build or Supervisor management."
        : null,
    };
  }

  return {
    canViewRuntime: true,
    canComplete: true,
    canViewDepartment: true,
    canCreateOneOff: !pinBlocksBuild,
    canReassign: !pinBlocksBuild,
    canMarkNotRequired: !pinBlocksBuild,
    canReopen: !pinBlocksBuild,
    canManage,
    canPublish,
    reason: pinBlocksBuild
      ? "Quick PIN does not grant Work Plan Build access."
      : null,
  };
}

export async function resolveWorkAuthority(
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
): Promise<WorkAuthorityDecision> {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId },
    select: { id: true },
  });

  return decideWorkAuthority({
    flagEnabled: isDietaryWorkPlansEnabled(),
    role: session.role,
    authMethod: session.authMethod,
    sessionFacilityId: session.facilityId,
    facilityId,
    departmentId,
    departmentExists: Boolean(department),
    primaryDepartmentId: session.primaryDepartmentId,
  });
}

export function requireWorkManage(authority: WorkAuthorityDecision): void {
  if (!authority.canManage) {
    throw new Error(authority.reason ?? "Work Plan manage denied.");
  }
}

export function requireWorkPublish(authority: WorkAuthorityDecision): void {
  if (!authority.canPublish) {
    throw new Error(authority.reason ?? "Work Plan publish denied.");
  }
}

export function requireWorkComplete(authority: WorkAuthorityDecision): void {
  if (!authority.canComplete) {
    throw new Error(authority.reason ?? "Work completion denied.");
  }
}

export function requireWorkSupervisorAction(authority: WorkAuthorityDecision): void {
  if (
    !authority.canCreateOneOff &&
    !authority.canReassign &&
    !authority.canMarkNotRequired &&
    !authority.canReopen
  ) {
    throw new Error(authority.reason ?? "Supervisor Work action denied.");
  }
}
