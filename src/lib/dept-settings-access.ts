import { resolveLedDepartmentIds } from "@/lib/department-authority/led-departments";
import { isCustomerDepartmentAccessAllowed } from "@/lib/department-products/load-facility-catalog";
import type { FacilitySession } from "@/lib/auth";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { prisma } from "@/lib/prisma";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

/** Facility admin, recorded department head, or department-scoped GM (primary dept match). */
export async function canManageDepartmentHeadSettings(
  session: FacilitySession,
  departmentId: string,
): Promise<boolean> {
  if (!(await isCustomerDepartmentAccessAllowed(prisma, session, departmentId))) return false;
  if (isFacilityAdministratorRole(session.role)) {
    return true;
  }
  const employeeId = await getOperationalEmployeeIdForSession(session);
  if (!employeeId) return false;

  const led = await resolveLedDepartmentIds(prisma, { facilityId: session.facilityId, employeeId });
  return led.includes(departmentId);
}
