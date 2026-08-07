import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { AppJwtPayload, AuthMethod } from "@/lib/auth";
import { isDepartmentOperationalCyclesEnabled } from "@/lib/department-operations";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { prisma } from "@/lib/prisma";

export type CycleAuthorityDecision = {
  canViewRuntime: boolean;
  canViewDepartment: boolean;
  canManage: boolean;
  canPublish: boolean;
  reason: string | null;
};

const DENIED: CycleAuthorityDecision = {
  canViewRuntime: false,
  canViewDepartment: false,
  canManage: false,
  canPublish: false,
  reason: "Insufficient Operational Cycle authority.",
};

/**
 * Pure authority decision for Operational Cycles (Phase 9A / 11B).
 * Quick PIN never grants Build (manage/publish) access.
 */
export function decideCycleAuthority(input: {
  flagEnabled: boolean;
  role: AppRole;
  authMethod: AuthMethod;
  sessionFacilityId: string;
  facilityId: string;
  departmentId: string;
  departmentExists: boolean;
  primaryDepartmentId: string | null | undefined;
}): CycleAuthorityDecision {
  if (!input.flagEnabled) {
    return {
      ...DENIED,
      reason: "Operational Cycles are not enabled for this department.",
    };
  }

  if (input.sessionFacilityId !== input.facilityId) {
    return {
      ...DENIED,
      reason: "Cross-facility Operational Cycle access denied.",
    };
  }

  if (!input.departmentExists) {
    return {
      ...DENIED,
      reason: "Department not found.",
    };
  }

  const role = input.role;
  const pinBlocksBuild = input.authMethod === "QUICK_PIN";

  if (!hasAtLeastRole(role, "SUPERVISOR")) {
    return {
      canViewRuntime: true,
      canViewDepartment: false,
      canManage: false,
      canPublish: false,
      reason: null,
    };
  }

  if (isFacilityAdministratorRole(role)) {
    if (input.primaryDepartmentId !== input.departmentId) {
      return {
        ...DENIED,
        reason:
          "Facility Administrator status alone does not grant Operational Cycle authority.",
      };
    }
  }

  const canViewDepartment = true;
  const canManage =
    !pinBlocksBuild && hasAtLeastRole(role, "MANAGER");
  const canPublish = canManage;

  if (hasAtLeastRole(role, "SUPERVISOR") && !canManage) {
    return {
      canViewRuntime: true,
      canViewDepartment,
      canManage: false,
      canPublish: false,
      reason: pinBlocksBuild
        ? "Quick PIN does not grant Operational Cycle Build access."
        : null,
    };
  }

  return {
    canViewRuntime: true,
    canViewDepartment,
    canManage,
    canPublish,
    reason: null,
  };
}

/**
 * Canonical Operational Cycle authority (department-keyed — Phase 11B).
 * Facility Administrator role alone does not grant cycle management.
 */
export async function resolveCycleAuthority(
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
): Promise<CycleAuthorityDecision> {
  // Cross-facility first so flag-off messaging does not mask facility denial.
  if (session.facilityId !== facilityId) {
    return decideCycleAuthority({
      flagEnabled: true,
      role: session.role as AppRole,
      authMethod: session.authMethod,
      sessionFacilityId: session.facilityId,
      facilityId,
      departmentId,
      departmentExists: false,
      primaryDepartmentId: null,
    });
  }

  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true, key: true },
  });

  let primaryDepartmentId = session.primaryDepartmentId ?? null;
  if (isFacilityAdministratorRole(session.role as AppRole)) {
    const user = await prisma.user.findFirst({
      where: { id: session.uid, facilityId, isActive: true },
      select: { primaryDepartmentId: true },
    });
    primaryDepartmentId = user?.primaryDepartmentId ?? null;
  }

  return decideCycleAuthority({
    flagEnabled: isDepartmentOperationalCyclesEnabled(department?.key),
    role: session.role as AppRole,
    authMethod: session.authMethod,
    sessionFacilityId: session.facilityId,
    facilityId,
    departmentId,
    departmentExists: Boolean(department),
    primaryDepartmentId,
  });
}

export function requireCycleManage(decision: CycleAuthorityDecision): void {
  if (!decision.canManage) {
    throw new Error(decision.reason ?? "Insufficient Operational Cycle authority.");
  }
}

export function requireCyclePublish(decision: CycleAuthorityDecision): void {
  if (!decision.canPublish) {
    throw new Error(decision.reason ?? "Insufficient Operational Cycle publish authority.");
  }
}
