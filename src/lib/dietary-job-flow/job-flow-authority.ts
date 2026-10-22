import { isCustomerDepartmentAccessAllowed } from "@/lib/department-products/load-facility-catalog";
import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { FacilitySession, AuthMethod } from "@/lib/auth";
import { DEPARTMENT_VIEW_REASON } from "@/lib/department-authority/access";
import { applyDepartmentChangeCeiling, loadDepartmentChangeAccess } from "@/lib/department-authority/changes";
import { resolveFacilityAdministratorView } from "@/lib/department-authority/resolve";
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
  /** CDA-03: the Facility Administrator views a self-operated Department they are not primary in. */
  facilityAdministratorView?: boolean;
  /** CDA-04: a head who is also Facility Administrator manages this Department. */
  headOfDepartment?: boolean;
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

  if (isFacilityAdministratorRole(role) && !input.headOfDepartment) {
    if (input.primaryDepartmentId !== input.departmentId) {
      if (input.facilityAdministratorView) {
        return {
          canViewOwnJobFlow: true,
          canViewSupervisorBoard: !pinBlocksBoard,
          reason: DEPARTMENT_VIEW_REASON,
        };
      }
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
  session: FacilitySession,
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

  if (!(await isCustomerDepartmentAccessAllowed(prisma, session, departmentId))) {
    return { ...DENIED, reason: "Department commercial access is unavailable." };
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
  const facilityAdministratorView =
    isFacilityAdministratorRole(session.role as AppRole) &&
    primaryDepartmentId !== departmentId &&
    (await resolveFacilityAdministratorView(prisma, session, { facilityId, departmentId }));
  const access = await loadDepartmentChangeAccess(prisma, session, { facilityId, departmentId });

  return applyDepartmentChangeCeiling(decideJobFlowAuthority({
    flagEnabled: isDepartmentJobFlowEnabled(department?.key),
    role: session.role as AppRole,
    authMethod: session.authMethod,
    sessionFacilityId: session.facilityId,
    facilityId,
    departmentId,
    departmentExists: Boolean(department),
    primaryDepartmentId,
    facilityAdministratorView,
    headOfDepartment: access?.isHead === true,
  }), access, {
    writes: [],
    views: ["canViewOwnJobFlow", "canViewSupervisorBoard"],
  });
}

export function requireSupervisorBoard(decision: JobFlowAuthorityDecision): void {
  if (!decision.canViewSupervisorBoard) {
    throw new Error(decision.reason ?? "Insufficient Supervisor Board authority.");
  }
}
