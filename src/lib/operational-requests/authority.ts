/**
 * Phase 12A Operational Request / Plant authority.
 * Quick PIN: frontline report + own requester status only — no Build / triage / WO manage.
 * FA alone denied without primaryDepartment matching scope.
 * Cross-facility fails closed.
 */

import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { AppJwtPayload, AuthMethod } from "@/lib/auth";
import {
  isDepartmentAssetOperationsEnabled,
  isDepartmentJobFlowEnabled,
} from "@/lib/department-operations";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { isPlantOperationsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

export type OperationalRequestAuthorityDecision = {
  canReport: boolean;
  canViewRequesterStatus: boolean;
  canTriage: boolean;
  canConfigureRoutes: boolean;
  canManageWorkOrders: boolean;
  canActOnAssignedWorkOrder: boolean;
  canViewInternalNotes: boolean;
  canReturnAssetToService: boolean;
  canManageVendors: boolean;
  reason: string | null;
};

const DENIED: OperationalRequestAuthorityDecision = {
  canReport: false,
  canViewRequesterStatus: false,
  canTriage: false,
  canConfigureRoutes: false,
  canManageWorkOrders: false,
  canActOnAssignedWorkOrder: false,
  canViewInternalNotes: false,
  canReturnAssetToService: false,
  canManageVendors: false,
  reason: "Insufficient Operational Request authority.",
};

export function decideOperationalRequestAuthority(input: {
  flagEnabled: boolean;
  role: AppRole;
  authMethod: AuthMethod;
  sessionFacilityId: string;
  facilityId: string;
  departmentId: string;
  departmentExists: boolean;
  departmentKey: string | null;
  primaryDepartmentId: string | null | undefined;
  /** When true, STAFF may act on WOs assigned to their employee identity. */
  isAssignedTechnician?: boolean;
}): OperationalRequestAuthorityDecision {
  if (!input.flagEnabled) {
    return {
      ...DENIED,
      reason: "Operational Requests / Plant Operations is not enabled for this department.",
    };
  }

  if (input.sessionFacilityId !== input.facilityId) {
    return {
      ...DENIED,
      reason: "Cross-facility Operational Request access denied.",
    };
  }

  if (!input.departmentExists) {
    return {
      ...DENIED,
      reason: "Department not found.",
    };
  }

  if (isFacilityAdministratorRole(input.role)) {
    if (input.primaryDepartmentId !== input.departmentId) {
      return {
        ...DENIED,
        reason:
          "Facility Administrator status alone does not grant Plant or Operational Request authority.",
      };
    }
  }

  const pinBlocksManage = input.authMethod === "QUICK_PIN";
  const isStaffOrLead = !hasAtLeastRole(input.role, "SUPERVISOR");
  const isPlant = input.departmentKey === "PLANT";

  if (isStaffOrLead) {
    return {
      canReport: true,
      canViewRequesterStatus: true,
      canTriage: false,
      canConfigureRoutes: false,
      canManageWorkOrders: false,
      canActOnAssignedWorkOrder:
        Boolean(input.isAssignedTechnician) && isPlant && !pinBlocksManage,
      canViewInternalNotes: false,
      canReturnAssetToService: false,
      canManageVendors: false,
      reason: null,
    };
  }

  if (hasAtLeastRole(input.role, "SUPERVISOR") && !hasAtLeastRole(input.role, "MANAGER")) {
    return {
      canReport: true,
      canViewRequesterStatus: true,
      canTriage: !pinBlocksManage && isPlant,
      canConfigureRoutes: false,
      canManageWorkOrders: !pinBlocksManage && isPlant,
      canActOnAssignedWorkOrder: !pinBlocksManage && isPlant,
      canViewInternalNotes: !pinBlocksManage,
      canReturnAssetToService: false,
      canManageVendors: false,
      reason: pinBlocksManage
        ? "Quick PIN does not grant Plant triage or Work Order management."
        : null,
    };
  }

  if (pinBlocksManage) {
    return {
      canReport: true,
      canViewRequesterStatus: true,
      canTriage: isPlant,
      canConfigureRoutes: false,
      canManageWorkOrders: false,
      canActOnAssignedWorkOrder: false,
      canViewInternalNotes: true,
      canReturnAssetToService: false,
      canManageVendors: false,
      reason: "Quick PIN does not grant Build, Vendor, or return-to-service authority.",
    };
  }

  return {
    canReport: true,
    canViewRequesterStatus: true,
    canTriage: isPlant,
    canConfigureRoutes: isPlant,
    canManageWorkOrders: isPlant,
    canActOnAssignedWorkOrder: isPlant,
    canViewInternalNotes: true,
    canReturnAssetToService: isPlant,
    canManageVendors: isPlant,
    reason: null,
  };
}

function requesterFlagForKey(key: string | null | undefined): boolean {
  if (key === "PLANT") return isPlantOperationsEnabled();
  if (key === "DIETARY" || key === "EVS") {
    return isDepartmentJobFlowEnabled(key) || isDepartmentAssetOperationsEnabled(key);
  }
  return false;
}

/** Requester-side report authority for Dietary / EVS / Plant when their ops flag is on. */
export async function resolveRequesterReportAuthority(
  session: AppJwtPayload,
  facilityId: string,
  requestingDepartmentId: string,
): Promise<OperationalRequestAuthorityDecision> {
  const department = await prisma.department.findFirst({
    where: { id: requestingDepartmentId, facilityId, isActive: true },
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

  return decideOperationalRequestAuthority({
    flagEnabled: requesterFlagForKey(department?.key),
    role: session.role as AppRole,
    authMethod: session.authMethod ?? "PASSWORD",
    sessionFacilityId: session.facilityId,
    facilityId,
    departmentId: requestingDepartmentId,
    departmentExists: Boolean(department),
    departmentKey: department?.key ?? null,
    primaryDepartmentId,
  });
}

export async function resolvePlantOperationsAuthority(
  session: AppJwtPayload,
  facilityId: string,
  plantDepartmentId: string,
  opts?: { isAssignedTechnician?: boolean },
): Promise<OperationalRequestAuthorityDecision> {
  const department = await prisma.department.findFirst({
    where: { id: plantDepartmentId, facilityId, isActive: true },
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

  return decideOperationalRequestAuthority({
    flagEnabled: isPlantOperationsEnabled() && department?.key === "PLANT",
    role: session.role as AppRole,
    authMethod: session.authMethod ?? "PASSWORD",
    sessionFacilityId: session.facilityId,
    facilityId,
    departmentId: plantDepartmentId,
    departmentExists: Boolean(department) && department?.key === "PLANT",
    departmentKey: department?.key ?? null,
    primaryDepartmentId,
    isAssignedTechnician: opts?.isAssignedTechnician,
  });
}

export function requireReport(decision: OperationalRequestAuthorityDecision) {
  if (!decision.canReport) {
    throw new Error(decision.reason ?? "Operational Request reporting denied.");
  }
}

export function requireTriage(decision: OperationalRequestAuthorityDecision) {
  if (!decision.canTriage) {
    throw new Error(decision.reason ?? "Operational Request triage denied.");
  }
}

export function requireConfigureRoutes(decision: OperationalRequestAuthorityDecision) {
  if (!decision.canConfigureRoutes) {
    throw new Error(decision.reason ?? "Request route configuration denied.");
  }
}

export function requirePlantWorkOrderManage(decision: OperationalRequestAuthorityDecision) {
  if (!decision.canManageWorkOrders && !decision.canActOnAssignedWorkOrder) {
    throw new Error(decision.reason ?? "Work Order management denied.");
  }
}

export function requirePlantManageWorkOrders(decision: OperationalRequestAuthorityDecision) {
  if (!decision.canManageWorkOrders) {
    throw new Error(decision.reason ?? "Work Order management denied.");
  }
}
