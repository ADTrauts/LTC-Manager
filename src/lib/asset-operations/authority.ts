import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { AppJwtPayload, AuthMethod } from "@/lib/auth";
import { isDepartmentAssetOperationsEnabled } from "@/lib/department-operations";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { prisma } from "@/lib/prisma";

export type AssetOperationsAuthorityDecision = {
  canViewRuntime: boolean;
  canReportIssue: boolean;
  canTriageIssue: boolean;
  canManageWorkOrders: boolean;
  canManageAssets: boolean;
  canAssignVendor: boolean;
  canChangeAssetStatus: boolean;
  canViewManagementNotes: boolean;
  canViewVendorDetails: boolean;
  reason: string | null;
};

const DENIED: AssetOperationsAuthorityDecision = {
  canViewRuntime: false,
  canReportIssue: false,
  canTriageIssue: false,
  canManageWorkOrders: false,
  canManageAssets: false,
  canAssignVendor: false,
  canChangeAssetStatus: false,
  canViewManagementNotes: false,
  canViewVendorDetails: false,
  reason: "Insufficient Asset Operations authority.",
};

/**
 * Pure authority decision for Asset Operations (Phase 10A / 11B / 12A).
 * Quick PIN may report scoped Issues; never grants Asset Builder / Vendor / Work Order manage.
 * Facility Administrator alone is denied unless primaryDepartment matches scope.
 */
export function decideAssetOperationsAuthority(input: {
  flagEnabled: boolean;
  role: AppRole;
  authMethod: AuthMethod;
  sessionFacilityId: string;
  facilityId: string;
  departmentId: string;
  departmentExists: boolean;
  departmentKey: string | null;
  primaryDepartmentId: string | null | undefined;
}): AssetOperationsAuthorityDecision {
  if (!input.flagEnabled) {
    return {
      ...DENIED,
      reason: "Asset Operations is not enabled for this department.",
    };
  }

  if (input.sessionFacilityId !== input.facilityId) {
    return {
      ...DENIED,
      reason: "Cross-facility Asset Operations access denied.",
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
          "Facility Administrator status alone does not grant Asset or Work Order authority.",
      };
    }
  }

  const pinBlocksManage = input.authMethod === "QUICK_PIN";
  const isStaffOrLead = !hasAtLeastRole(input.role, "SUPERVISOR");

  if (isStaffOrLead) {
    return {
      canViewRuntime: true,
      canReportIssue: true,
      canTriageIssue: false,
      canManageWorkOrders: false,
      canManageAssets: false,
      canAssignVendor: false,
      canChangeAssetStatus: false,
      canViewManagementNotes: false,
      canViewVendorDetails: false,
      reason: null,
    };
  }

  if (hasAtLeastRole(input.role, "SUPERVISOR") && !hasAtLeastRole(input.role, "MANAGER")) {
    return {
      canViewRuntime: true,
      canReportIssue: true,
      canTriageIssue: true,
      canManageWorkOrders: !pinBlocksManage,
      canManageAssets: false,
      canAssignVendor: false,
      canChangeAssetStatus: !pinBlocksManage,
      canViewManagementNotes: true,
      canViewVendorDetails: !pinBlocksManage,
      reason: null,
    };
  }

  // MANAGER / GM (+ FA with matching primary dept)
  if (pinBlocksManage) {
    return {
      canViewRuntime: true,
      canReportIssue: true,
      canTriageIssue: true,
      canManageWorkOrders: false,
      canManageAssets: false,
      canAssignVendor: false,
      canChangeAssetStatus: false,
      canViewManagementNotes: true,
      canViewVendorDetails: false,
      reason: null,
    };
  }

  return {
    canViewRuntime: true,
    canReportIssue: true,
    canTriageIssue: true,
    canManageWorkOrders: true,
    canManageAssets: true,
    canAssignVendor: true,
    canChangeAssetStatus: true,
    canViewManagementNotes: true,
    canViewVendorDetails: true,
    reason: null,
  };
}

export async function resolveAssetOperationsAuthority(
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
): Promise<AssetOperationsAuthorityDecision> {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true, key: true },
  });

  return decideAssetOperationsAuthority({
    flagEnabled: isDepartmentAssetOperationsEnabled(department?.key),
    role: session.role as AppRole,
    authMethod: session.authMethod ?? "PASSWORD",
    sessionFacilityId: session.facilityId,
    facilityId,
    departmentId,
    departmentExists: Boolean(department),
    departmentKey: department?.key ?? null,
    primaryDepartmentId: session.primaryDepartmentId,
  });
}

export function requireAssetReport(decision: AssetOperationsAuthorityDecision) {
  if (!decision.canReportIssue) {
    throw new Error(decision.reason ?? "Asset Issue reporting denied.");
  }
}

export function requireAssetTriage(decision: AssetOperationsAuthorityDecision) {
  if (!decision.canTriageIssue) {
    throw new Error(decision.reason ?? "Asset Issue triage denied.");
  }
}

export function requireAssetManage(decision: AssetOperationsAuthorityDecision) {
  if (!decision.canManageAssets) {
    throw new Error(decision.reason ?? "Asset management denied.");
  }
}

export function requireWorkOrderManage(decision: AssetOperationsAuthorityDecision) {
  if (!decision.canManageWorkOrders) {
    throw new Error(decision.reason ?? "Work Order management denied.");
  }
}

export function requireAssetStatusChange(decision: AssetOperationsAuthorityDecision) {
  if (!decision.canChangeAssetStatus) {
    throw new Error(decision.reason ?? "Asset status change denied.");
  }
}
