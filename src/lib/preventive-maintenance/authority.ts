import { isCustomerDepartmentAccessAllowed } from "@/lib/department-products/load-facility-catalog";
/**
 * Preventive Maintenance Build authority.
 * Follows Department Builder governance: Manager+ publish/retire; Quick PIN never builds.
 */

import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { FacilitySession, AuthMethod } from "@/lib/auth";
import type { Prisma, PrismaClient } from "@prisma/client";

import { DEPARTMENT_VIEW_REASON } from "@/lib/department-authority/access";
import { applyDepartmentChangeCeiling, loadDepartmentChangeAccess } from "@/lib/department-authority/changes";
import { resolveFacilityAdministratorView } from "@/lib/department-authority/resolve";
import { isDepartmentAssetOperationsEnabled } from "@/lib/department-operations";
import { isPlantRuntimeEnabled } from "@/lib/department-products/plant-runtime";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type PmPlanAuthorityDecision = {
  canView: boolean;
  /** Supervisor+ (password) may create and edit drafts. */
  canDraft: boolean;
  /** Manager+ (password) — publish, retire, and historical manage. */
  canManage: boolean;
  canPublish: boolean;
  canRetire: boolean;
  canSkip: boolean;
  reason: string | null;
};

const DENIED: PmPlanAuthorityDecision = {
  canView: false,
  canDraft: false,
  canManage: false,
  canPublish: false,
  canRetire: false,
  canSkip: false,
  reason: "Insufficient Preventive Maintenance authority.",
};

export function decidePmPlanAuthority(input: {
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
}): PmPlanAuthorityDecision {
  if (!input.flagEnabled) {
    return { ...DENIED, reason: "Asset Operations is not enabled for this department." };
  }
  if (input.sessionFacilityId !== input.facilityId) {
    return { ...DENIED, reason: "Cross-facility Preventive Maintenance access denied." };
  }
  if (!input.departmentExists) {
    return { ...DENIED, reason: "Department not found." };
  }
  if (isFacilityAdministratorRole(input.role) && !input.headOfDepartment) {
    if (input.primaryDepartmentId !== input.departmentId) {
      if (input.facilityAdministratorView) {
        return { ...DENIED, canView: true, reason: DEPARTMENT_VIEW_REASON };
      }
      return {
        ...DENIED,
        reason: "Facility Administrator status alone does not grant PM Plan authority.",
      };
    }
  }

  const pinBlocksBuild = input.authMethod === "QUICK_PIN";
  if (!hasAtLeastRole(input.role, "SUPERVISOR")) {
    return { ...DENIED, canView: true, reason: null };
  }

  const canDraft = !pinBlocksBuild && hasAtLeastRole(input.role, "SUPERVISOR");
  const canManage = !pinBlocksBuild && hasAtLeastRole(input.role, "MANAGER");
  if (hasAtLeastRole(input.role, "SUPERVISOR") && !canManage) {
    return {
      canView: true,
      canDraft,
      canManage: false,
      canPublish: false,
      canRetire: false,
      canSkip: true,
      reason: pinBlocksBuild
        ? "Quick PIN does not grant Preventive Maintenance Build access."
        : null,
    };
  }

  return {
    canView: true,
    canDraft,
    canManage,
    canPublish: canManage,
    canRetire: canManage,
    canSkip: true,
    reason: null,
  };
}

export async function resolvePmPlanAuthority(
  session: FacilitySession,
  facilityId: string,
  departmentId: string,
  client: DbClient = prisma,
): Promise<PmPlanAuthorityDecision> {
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
  return applyDepartmentChangeCeiling(decidePmPlanAuthority({
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
    writes: ["canDraft", "canManage", "canPublish", "canRetire", "canSkip"],
    views: ["canView"],
  });
}

export function requirePmDraft(decision: PmPlanAuthorityDecision) {
  if (!decision.canDraft) {
    throw new Error(decision.reason || "Insufficient Preventive Maintenance draft authority.");
  }
}

export function requirePmManage(decision: PmPlanAuthorityDecision) {
  if (!decision.canManage) {
    throw new Error(decision.reason || "Insufficient Preventive Maintenance authority.");
  }
}

export function requirePmPublish(decision: PmPlanAuthorityDecision) {
  if (!decision.canPublish) {
    throw new Error(decision.reason || "Insufficient Preventive Maintenance publish authority.");
  }
}

export function requirePmRetire(decision: PmPlanAuthorityDecision) {
  if (!decision.canRetire) {
    throw new Error(decision.reason || "Insufficient Preventive Maintenance retire authority.");
  }
}

export function requirePmSkip(decision: PmPlanAuthorityDecision) {
  if (!decision.canSkip) {
    throw new Error(decision.reason || "Insufficient Preventive Maintenance skip authority.");
  }
}
