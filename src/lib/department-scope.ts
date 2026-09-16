import type { AppJwtPayload } from "@/lib/auth";
import { resolveDepartmentMembershipIds } from "@/lib/employee-membership";
import { prisma } from "@/lib/prisma";

/**
 * Department IDs to use when filtering department-scoped data (logs, templates).
 * `null` means no filter — show all departments (typical for GM / unset home department).
 */
export async function departmentFilterIdsForSession(session: AppJwtPayload): Promise<string[] | null> {
  if (session.authKind === "user") {
    if (!session.primaryDepartmentId) {
      return null;
    }
    return [session.primaryDepartmentId];
  }

  const employee = await prisma.employee.findUnique({
    where: { id: session.uid },
    select: {
      primaryDepartmentId: true,
      employeeDepartments: { select: { departmentId: true } },
    },
  });
  if (!employee) {
    return null;
  }
  const ids = resolveDepartmentMembershipIds(employee);
  if (ids.length === 0) {
    return null;
  }
  return ids;
}
