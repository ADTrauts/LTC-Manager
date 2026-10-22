import { isCustomerDepartmentAccessAllowed } from "@/lib/department-products/load-facility-catalog";
import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { FacilitySession, AuthMethod } from "@/lib/auth";
import { DEPARTMENT_VIEW_REASON } from "@/lib/department-authority/access";
import { applyDepartmentChangeCeiling, loadDepartmentChangeAccess } from "@/lib/department-authority/changes";
import { resolveFacilityAdministratorView } from "@/lib/department-authority/resolve";
import { isDepartmentAssetOperationsEnabled } from "@/lib/department-operations";
import { isPlantRuntimeEnabled } from "@/lib/department-products/plant-runtime";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

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
 * Facility Administrator may view facility Asset runtime (profiles and attached
 * Records). Manage / Work Order authority still requires primaryDepartment match.
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
  /** CDA-03: the Facility Administrator views a self-operated Department they are not primary in. */
  facilityAdministratorView?: boolean;
  /** CDA-04: a head who is also Facility Administrator manages this Department. */
  headOfDepartment?: boolean;
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

  if (isFacilityAdministratorRole(input.role) && !input.headOfDepartment) {
    if (input.primaryDepartmentId !== input.departmentId) {
      if (input.facilityAdministratorView) {
        return {
          ...DENIED,
          canViewRuntime: true,
          canViewManagementNotes: true,
          canViewVendorDetails: true,
          reason: DEPARTMENT_VIEW_REASON,
        };
      }
      return {
        ...DENIED,
        canViewRuntime: true,
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
  session: FacilitySession,
  facilityId: string,
  departmentId: string,
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<AssetOperationsAuthorityDecision> {
  if (session.facilityId !== facilityId || !(await isCustomerDepartmentAccessAllowed(client, session, departmentId))) {
    return { ...DENIED, reason: "Department commercial access is unavailable." };
  }
  const department = await client.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true, key: true },
  });
  const facilityAdministratorView =
    isFacilityAdministratorRole(session.role as AppRole) &&
    session.primaryDepartmentId !== departmentId &&
    (await resolveFacilityAdministratorView(client, session, { facilityId, departmentId }));
  const access = await loadDepartmentChangeAccess(client, session, { facilityId, departmentId });

  return applyDepartmentChangeCeiling(decideAssetOperationsAuthority({
    flagEnabled:
      department?.key === "PLANT"
        ? await isPlantRuntimeEnabled(facilityId, session)
        : isDepartmentAssetOperationsEnabled(department?.key),
    role: session.role as AppRole,
    authMethod: session.authMethod ?? "PASSWORD",
    sessionFacilityId: session.facilityId,
    facilityId,
    departmentId,
    departmentExists: Boolean(department),
    departmentKey: department?.key ?? null,
    primaryDepartmentId: session.primaryDepartmentId,
    facilityAdministratorView,
    headOfDepartment: access?.isHead === true,
  }), access, {
    writes: ["canReportIssue", "canTriageIssue", "canManageWorkOrders", "canManageAssets", "canAssignVendor", "canChangeAssetStatus"],
    views: ["canViewRuntime", "canViewManagementNotes", "canViewVendorDetails"],
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
