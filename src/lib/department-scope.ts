import type { AppJwtPayload } from "@/lib/auth";
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
  const ids = new Set<string>();
  if (employee.primaryDepartmentId) {
    ids.add(employee.primaryDepartmentId);
  }
  for (const row of employee.employeeDepartments) {
    ids.add(row.departmentId);
  }
  if (ids.size === 0) {
    return null;
  }
  return [...ids];
}
