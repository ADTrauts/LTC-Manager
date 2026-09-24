import type { AppRole } from "@/lib/access";
import { hasAtLeastRole } from "@/lib/access";
import type { AppJwtPayload, AuthMethod } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type CoverageAuthorityDecision = {
  canView: boolean;
  canManage: boolean;
  reason: string | null;
};

const DENIED: CoverageAuthorityDecision = {
  canView: false,
  canManage: false,
  reason: "Insufficient Coverage configuration authority.",
};

export function decideCoverageAuthority(input: {
  role: AppRole;
  authMethod: AuthMethod;
  sessionFacilityId: string;
  facilityId: string;
  departmentExists: boolean;
}): CoverageAuthorityDecision {
  if (input.sessionFacilityId !== input.facilityId) {
    return { ...DENIED, reason: "Cross-facility Coverage access denied." };
  }
  if (!input.departmentExists) {
    return { ...DENIED, reason: "Department not found." };
  }
  if (input.authMethod === "QUICK_PIN") {
    return {
      canView: hasAtLeastRole(input.role, "MANAGER"),
      canManage: false,
      reason: "Quick PIN does not grant Coverage configuration access.",
    };
  }
  if (!hasAtLeastRole(input.role, "MANAGER")) {
    return { ...DENIED, reason: "Manager or above required to configure Coverage." };
  }
  return { canView: true, canManage: true, reason: null };
}

export function requireCoverageManage(decision: CoverageAuthorityDecision): void {
  if (!decision.canManage) {
    throw new Error(decision.reason ?? "Insufficient Coverage configuration authority.");
  }
}

export async function resolveCoverageAuthority(
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
): Promise<CoverageAuthorityDecision> {
  if (session.facilityId !== facilityId) {
    return decideCoverageAuthority({
      role: session.role as AppRole,
      authMethod: session.authMethod,
      sessionFacilityId: session.facilityId,
      facilityId,
      departmentExists: false,
    });
  }
  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true },
  });
  return decideCoverageAuthority({
    role: session.role as AppRole,
    authMethod: session.authMethod,
    sessionFacilityId: session.facilityId,
    facilityId,
    departmentExists: Boolean(department),
  });
}
