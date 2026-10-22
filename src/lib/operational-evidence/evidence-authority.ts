import { isCustomerDepartmentAccessAllowed } from "@/lib/department-products/load-facility-catalog";
import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { FacilitySession, AuthMethod } from "@/lib/auth";
import { DEPARTMENT_VIEW_REASON } from "@/lib/department-authority/access";
import { applyDepartmentChangeCeiling, loadDepartmentChangeAccess } from "@/lib/department-authority/changes";
import { resolveFacilityAdministratorView } from "@/lib/department-authority/resolve";
import { isDepartmentEngineEnabledForFacility } from "@/lib/department-operations";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { prisma } from "@/lib/prisma";

export type EvidenceAuthorityDecision = {
  canSubmit: boolean;
  canViewOwn: boolean;
  canViewDepartment: boolean;
  canViewLogBook: boolean;
  canCorrect: boolean;
  canManage: boolean;
  canPublish: boolean;
  reason: string | null;
};

const DENIED: EvidenceAuthorityDecision = {
  canSubmit: false,
  canViewOwn: false,
  canViewDepartment: false,
  canViewLogBook: false,
  canCorrect: false,
  canManage: false,
  canPublish: false,
  reason: "Insufficient Operational Evidence authority.",
};

/**
 * Pure authority decision for Operational Evidence (Phase 9C).
 * Quick PIN may submit; never grants Build (manage/publish).
 */
export function decideEvidenceAuthority(input: {
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
}): EvidenceAuthorityDecision {
  if (!input.flagEnabled) {
    return {
      ...DENIED,
      reason: "Operational Evidence is not enabled for this department.",
    };
  }

  if (input.sessionFacilityId !== input.facilityId) {
    return {
      ...DENIED,
      reason: "Cross-facility Operational Evidence access denied.",
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

  if (isFacilityAdministratorRole(role) && !input.headOfDepartment) {
    if (input.primaryDepartmentId !== input.departmentId) {
      if (input.facilityAdministratorView) {
        return {
          ...DENIED,
          canViewOwn: true,
          canViewDepartment: true,
          canViewLogBook: true,
          reason: DEPARTMENT_VIEW_REASON,
        };
      }
      return {
        ...DENIED,
        reason:
          "Facility Administrator status alone does not grant Operational Evidence authority.",
      };
    }
  }

  // STAFF / LEAD: submit + view own; no department-wide Log Book / manage / publish.
  if (!hasAtLeastRole(role, "SUPERVISOR")) {
    return {
      canSubmit: true,
      canViewOwn: true,
      canViewDepartment: false,
      canViewLogBook: false,
      canCorrect: false,
      canManage: false,
      canPublish: false,
      reason: null,
    };
  }

  const canManage = !pinBlocksBuild && hasAtLeastRole(role, "MANAGER");
  const canPublish = canManage;
  const canCorrect = hasAtLeastRole(role, "SUPERVISOR");

  if (hasAtLeastRole(role, "SUPERVISOR") && !canManage) {
    return {
      canSubmit: true,
      canViewOwn: true,
      canViewDepartment: true,
      canViewLogBook: true,
      canCorrect,
      canManage: false,
      canPublish: false,
      reason: pinBlocksBuild
        ? "Quick PIN does not grant Operational Evidence Build access."
        : null,
    };
  }

  return {
    canSubmit: true,
    canViewOwn: true,
    canViewDepartment: true,
    canViewLogBook: true,
    canCorrect,
    canManage,
    canPublish,
    reason: null,
  };
}

/**
 * Canonical Phase 9C Operational Evidence authority.
 * Facility Administrator role alone does not grant Dietary evidence management.
 */
export async function resolveEvidenceAuthority(
  session: FacilitySession,
  facilityId: string,
  departmentId: string,
): Promise<EvidenceAuthorityDecision> {
  // Cross-facility first so flag-off messaging does not mask facility denial.
  if (session.facilityId !== facilityId) {
    return decideEvidenceAuthority({
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

  const ceilinged = applyDepartmentChangeCeiling(decideEvidenceAuthority({
    flagEnabled:
      (await isDepartmentEngineEnabledForFacility(
        facilityId,
        "evidence",
        department?.key,
        session,
      )) || isCanonicalLogsEnabled(),
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
    writes: ["canSubmit", "canCorrect", "canManage", "canPublish"],
    views: ["canViewOwn", "canViewDepartment", "canViewLogBook"],
  });
  if (access?.mode === "SUMMARY" && access.canReadComplianceRecords) {
    return { ...ceilinged, canViewDepartment: true, canViewLogBook: true, reason: access.reason };
  }
  return ceilinged;
}

export function requireEvidenceManage(decision: EvidenceAuthorityDecision): void {
  if (!decision.canManage) {
    throw new Error(decision.reason ?? "Insufficient Operational Evidence authority.");
  }
}

export function requireEvidencePublish(decision: EvidenceAuthorityDecision): void {
  if (!decision.canPublish) {
    throw new Error(decision.reason ?? "Insufficient Operational Evidence publish authority.");
  }
}

export function requireEvidenceSubmit(decision: EvidenceAuthorityDecision): void {
  if (!decision.canSubmit) {
    throw new Error(decision.reason ?? "Insufficient Operational Evidence submit authority.");
  }
}

export function requireEvidenceCorrect(decision: EvidenceAuthorityDecision): void {
  if (!decision.canCorrect) {
    throw new Error(decision.reason ?? "Insufficient Operational Evidence correction authority.");
  }
}

export function requireEvidenceLogBook(decision: EvidenceAuthorityDecision): void {
  if (!decision.canViewLogBook && !decision.canViewOwn) {
    throw new Error(decision.reason ?? "Insufficient Operational Evidence Log Book authority.");
  }
}
