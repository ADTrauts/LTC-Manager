import type { FacilitySession } from "@/lib/auth";
import { findEmployeeForUserFacility } from "@/lib/employee-identity/lookup";
import { prisma } from "@/lib/prisma";

/**
 * Operational employee id for the signed-in actor.
 * PIN = Employee.id. Internal User = Employee.userId + selected Facility.
 * Partner / Harbor / Organization sessions do not invent an Employee.
 */
export async function getOperationalEmployeeIdForSession(session: FacilitySession): Promise<string | null> {
  if (session.authKind === "harbor_staff") return null;
  if (session.authKind === "employee") {
    return session.uid ?? null;
  }
  if (session.authKind !== "user") return null;
  if (session.accessKind === "partner" || session.scopeKind === "organization") {
    return null;
  }
  if (!session.uid || !session.facilityId) return null;
  const employee = await findEmployeeForUserFacility(prisma, {
    userId: session.uid,
    facilityId: session.facilityId,
  });
  return employee?.id ?? null;
}
