import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { AppJwtPayload, AuthMethod } from "@/lib/auth";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { isDietaryOperationalEvidenceEnabled } from "@/lib/feature-flags";
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
}): EvidenceAuthorityDecision {
  if (!input.flagEnabled) {
    return {
      ...DENIED,
      reason: "Dietary Operational Evidence is not enabled.",
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

  if (isFacilityAdministratorRole(role)) {
    if (input.primaryDepartmentId !== input.departmentId) {
      return {
        ...DENIED,
        reason:
          "Facility Administrator status alone does not grant Dietary Operational Evidence authority.",
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
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
): Promise<EvidenceAuthorityDecision> {
  const flagEnabled = isDietaryOperationalEvidenceEnabled();

  if (!flagEnabled) {
    return decideEvidenceAuthority({
      flagEnabled: false,
      role: session.role as AppRole,
      authMethod: session.authMethod,
      sessionFacilityId: session.facilityId,
      facilityId,
      departmentId,
      departmentExists: false,
      primaryDepartmentId: null,
    });
  }

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

  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true },
  });

  let primaryDepartmentId = session.primaryDepartmentId ?? null;
  if (isFacilityAdministratorRole(session.role as AppRole)) {
    const user = await prisma.user.findFirst({
      where: { id: session.uid, facilityId, isActive: true },
      select: { primaryDepartmentId: true },
    });
    primaryDepartmentId = user?.primaryDepartmentId ?? null;
  }

  return decideEvidenceAuthority({
    flagEnabled: true,
    role: session.role as AppRole,
    authMethod: session.authMethod,
    sessionFacilityId: session.facilityId,
    facilityId,
    departmentId,
    departmentExists: Boolean(department),
    primaryDepartmentId,
  });
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
