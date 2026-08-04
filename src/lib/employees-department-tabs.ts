import { redirect } from "next/navigation";
import type { Prisma, PrismaClient } from "@prisma/client";

import { employeeBelongsToDepartmentWhere } from "@/lib/employee-department-scope";

export type EmployeeAppDepartment = { id: string; name: string };

export async function loadEmployeeAppDepartments(
  prisma: PrismaClient,
  facilityId: string,
): Promise<EmployeeAppDepartment[]> {
  return prisma.department.findMany({
    where: { facilityId, isActive: true, showInEmployeeApp: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

export function parseEmployeesDeptId(
  sp: { [key: string]: string | string[] | undefined },
  allowedIds: Set<string>,
): string | null {
  const raw = typeof sp.dept === "string" ? sp.dept.trim() : "";
  return raw && allowedIds.has(raw) ? raw : null;
}

/** Redirect target when `dept` is present but not an app-visible department. */
export function employeesPathWithoutInvalidDept(
  pathname: string,
  sp: { [key: string]: string | string[] | undefined },
): string {
  const p = new URLSearchParams();
  for (const [key, val] of Object.entries(sp)) {
    if (key === "dept" || val === undefined) continue;
    if (typeof val === "string" && val.length > 0) p.set(key, val);
  }
  const q = p.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export function employeeWhereForFacilityAndDept(
  facilityId: string,
  departmentId: string | null,
): Prisma.EmployeeWhereInput {
  if (!departmentId) return { facilityId };
  return { AND: [{ facilityId }, employeeBelongsToDepartmentWhere(departmentId)] };
}

export function hrefWithEmployeesDept(pathname: string, departmentId: string | null, hash?: string): string {
  const base = departmentId ? `${pathname}?dept=${encodeURIComponent(departmentId)}` : pathname;
  return hash ? `${base}${hash}` : base;
}

export async function resolveEmployeesDeptScope(
  prisma: PrismaClient,
  facilityId: string,
  pathname: string,
  sp: { [key: string]: string | string[] | undefined },
): Promise<{ departments: EmployeeAppDepartment[]; deptId: string | null; deptName: string | null }> {
  const departments = await loadEmployeeAppDepartments(prisma, facilityId);
  const allowedIds = new Set(departments.map((d) => d.id));
  const rawDept = typeof sp.dept === "string" ? sp.dept.trim() : "";
  if (rawDept && !allowedIds.has(rawDept)) {
    redirect(employeesPathWithoutInvalidDept(pathname, sp));
  }
  const deptId = parseEmployeesDeptId(sp, allowedIds);
  const deptName = deptId ? (departments.find((d) => d.id === deptId)?.name ?? null) : null;
  return { departments, deptId, deptName };
}
