import type { AppJwtPayload } from "@/lib/auth";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { prisma } from "@/lib/prisma";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";
import { RoleKey } from "@prisma/client";

/** Facility admin, recorded department head, or department-scoped GM (primary dept match). */
export async function canManageDepartmentHeadSettings(
  session: AppJwtPayload,
  departmentId: string,
): Promise<boolean> {
  if (isFacilityAdministratorRole(session.role)) {
    return true;
  }
  const empId = await getOperationalEmployeeIdForSession(session);
  if (!empId) return false;

  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId: session.facilityId },
    select: { headEmployeeId: true },
  });
  if (department?.headEmployeeId === empId) return true;

  const employee = await prisma.employee.findFirst({
    where: { id: empId, facilityId: session.facilityId },
    select: { roleType: true, primaryDepartmentId: true },
  });
  return Boolean(
    employee?.roleType === RoleKey.GM && employee.primaryDepartmentId === departmentId,
  );
}
