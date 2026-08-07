import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { AppJwtPayload, AuthMethod } from "@/lib/auth";
import { isDepartmentJobFlowEnabled } from "@/lib/department-operations";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { prisma } from "@/lib/prisma";

export type JobFlowAuthorityDecision = {
  canViewOwnJobFlow: boolean;
  canViewSupervisorBoard: boolean;
  reason: string | null;
};

const DENIED: JobFlowAuthorityDecision = {
  canViewOwnJobFlow: false,
  canViewSupervisorBoard: false,
  reason: "Insufficient Job Flow authority.",
};

/**
 * Pure authority decision for Job Flow / Supervisor Operations Board (Phase 9B / 11B).
 * Quick PIN never grants Supervisor Board.
 * Facility Administrator alone is denied without primaryDepartmentId === departmentId
 * (mirrors cycle-authority / assignment-authority).
 */
export function decideJobFlowAuthority(input: {
  flagEnabled: boolean;
  role: AppRole;
  authMethod: AuthMethod;
  sessionFacilityId: string;
  facilityId: string;
  departmentId: string;
  departmentExists: boolean;
  primaryDepartmentId: string | null | undefined;
}): JobFlowAuthorityDecision {
  if (!input.flagEnabled) {
    return {
      ...DENIED,
      reason: "Job Flow is not enabled for this department.",
    };
  }

  if (input.sessionFacilityId !== input.facilityId) {
    return {
      ...DENIED,
      reason: "Cross-facility Job Flow access denied.",
    };
  }

  if (!input.departmentExists) {
    return {
      ...DENIED,
      reason: "Department not found.",
    };
  }

  const role = input.role;
  const pinBlocksBoard = input.authMethod === "QUICK_PIN";

  // STAFF / LEAD: own Job Flow only.
  if (!hasAtLeastRole(role, "SUPERVISOR")) {
    return {
      canViewOwnJobFlow: true,
      canViewSupervisorBoard: false,
      reason: null,
    };
  }

  if (isFacilityAdministratorRole(role)) {
    if (input.primaryDepartmentId !== input.departmentId) {
      return {
        ...DENIED,
        reason:
          "Facility Administrator status alone does not grant Job Flow or Supervisor Board authority.",
      };
    }
  }

  const canViewSupervisorBoard = !pinBlocksBoard;

  return {
    canViewOwnJobFlow: true,
    canViewSupervisorBoard,
    reason: pinBlocksBoard
      ? "Quick PIN does not grant Supervisor Operations Board access."
      : null,
  };
}

/**
 * Canonical Job Flow authority (department-keyed flags — Phase 11B).
 * Facility Administrator role alone does not grant Supervisor Board.
 */
export async function resolveJobFlowAuthority(
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
): Promise<JobFlowAuthorityDecision> {
  // Cross-facility first so flag-off messaging does not mask facility denial.
  if (session.facilityId !== facilityId) {
    return decideJobFlowAuthority({
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

  return decideJobFlowAuthority({
    flagEnabled: isDepartmentJobFlowEnabled(department?.key),
    role: session.role as AppRole,
    authMethod: session.authMethod,
    sessionFacilityId: session.facilityId,
    facilityId,
    departmentId,
    departmentExists: Boolean(department),
    primaryDepartmentId,
  });
}

export function requireSupervisorBoard(decision: JobFlowAuthorityDecision): void {
  if (!decision.canViewSupervisorBoard) {
    throw new Error(decision.reason ?? "Insufficient Supervisor Board authority.");
  }
}
