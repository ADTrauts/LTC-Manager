import type { Prisma, PrismaClient } from "@prisma/client";
import { isCustomerDepartmentAccessAllowed } from "@/lib/department-products/load-facility-catalog";
import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import { isPartnerFacilitySession, type FacilitySession } from "@/lib/auth";
import { withDepartmentChangeCeiling } from "@/lib/department-authority/changes";
import { hasDietaryDomainCapabilities } from "@/lib/department-admission";
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

type AssignmentAuthorityStore = PrismaClient | Prisma.TransactionClient;

const FA_DIETARY_REASON =
  "Facility Administrator status alone does not grant Dietary Assignment authority.";

/**
 * Canonical Phase 7A Assignment authority.
 * Facility Administrator role alone does not grant Dietary Assignment management.
 * FA "here" is the current Facility session role. The Dietary relationship is the
 * current Facility's HFN Department, not User home metadata.
 */
export async function resolveAssignmentAuthority(input: {
  session: FacilitySession;
  departmentId: string;
  facilityId: string;
  db?: AssignmentAuthorityStore;
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

  if (isPartnerFacilitySession(input.session)) {
    return { ...denied, canViewOwn: false, reason: "Partner Assignment access denied." };
  }

  if (input.session.facilityId !== input.facilityId) {
    return { ...denied, canViewOwn: false, reason: "Cross-facility Assignment access denied." };
  }

  const store = input.db ?? prisma;
  const department = await store.department.findFirst({
    where: {
      id: input.departmentId,
      facilityId: input.facilityId,
      isActive: true,
    },
    select: { id: true, key: true },
  });
  if (!department) {
    return { ...denied, canViewOwn: false, reason: "Department not found." };
  }

  if (!(await isCustomerDepartmentAccessAllowed(store, input.session, input.departmentId))) {
    return { ...denied, canViewOwn: false, reason: "Department commercial access is unavailable." };
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

  if (isFacilityAdministratorRole(role)) {
    if (input.session.authKind !== "user") {
      return { ...denied, reason: FA_DIETARY_REASON };
    }
    if (!hasDietaryDomainCapabilities(department.key)) {
      return { ...denied, reason: FA_DIETARY_REASON };
    }
  }

  const manage = hasAtLeastRole(role, "SUPERVISOR");
  return withDepartmentChangeCeiling(
    store,
    input.session,
    { facilityId: input.facilityId, departmentId: input.departmentId },
    {
      canViewOwn: true,
      canViewDepartment: manage,
      canManage: manage,
      canConfirm: manage,
      canReopen: manage,
      canOverride: manage,
      reason: null,
    },
    {
      writes: ["canManage", "canConfirm", "canReopen", "canOverride"],
      views: ["canViewOwn", "canViewDepartment"],
    },
  );
}

export function requireAssignmentManage(decision: AssignmentAuthorityDecision): void {
  if (!decision.canManage) {
    throw new Error(decision.reason ?? "Insufficient Assignment authority.");
  }
}
