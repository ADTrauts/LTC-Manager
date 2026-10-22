import { EmployeeStatus, RoleKey, type Prisma, type PrismaClient } from "@prisma/client";

import { loadCurrentOperatorsForFacilityDepartments } from "@/lib/department-operators/service";
import { employeeBelongsToDepartment } from "@/lib/employee-membership/department";

type DbClient = PrismaClient | Prisma.TransactionClient;

/** HEAD_LEFT: the recorded head's employment ended or they are no longer in the Department. */
export type DepartmentHeadStatus = "HEADED" | "NO_HEAD" | "HEAD_LEFT";

export type DepartmentHeadCandidate = {
  status: EmployeeStatus;
  primaryDepartmentId: string | null;
  employeeDepartments: ReadonlyArray<{ departmentId: string }>;
};

export function isActiveDepartmentMember(
  employee: DepartmentHeadCandidate,
  departmentId: string,
): boolean {
  return employee.status !== EmployeeStatus.TERMINATED && employeeBelongsToDepartment(employee, departmentId);
}

/** Same head rule as `deriveLedDepartmentIds`: the recorded head link, or an active GM whose primary Department it is. */
export function deriveDepartmentHeadStatus(input: {
  departmentId: string;
  recordedHead: DepartmentHeadCandidate | null;
  hasActivePrimaryGm: boolean;
}): DepartmentHeadStatus {
  if (input.recordedHead && isActiveDepartmentMember(input.recordedHead, input.departmentId)) return "HEADED";
  if (input.hasActivePrimaryGm) return "HEADED";
  return input.recordedHead ? "HEAD_LEFT" : "NO_HEAD";
}

export type DepartmentNeedingHead = {
  departmentId: string;
  name: string;
  status: Exclude<DepartmentHeadStatus, "HEADED">;
  /** The departed head, when HEAD_LEFT. */
  formerHeadName: string | null;
};

/**
 * The Facility Administrator's missing-head to-do list (CDA-D05): active self-operated Departments
 * with no head. Vendor-run Departments get their head from the vendor (CDA-05) and are not listed.
 */
export async function listDepartmentsNeedingHead(
  db: DbClient,
  input: { facilityId: string; departmentIds?: readonly string[]; now?: Date },
): Promise<DepartmentNeedingHead[]> {
  const departments = await db.department.findMany({
    where: {
      facilityId: input.facilityId,
      isActive: true,
      ...(input.departmentIds ? { id: { in: [...input.departmentIds] } } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      headEmployee: {
        select: {
          firstName: true,
          lastName: true,
          status: true,
          primaryDepartmentId: true,
          employeeDepartments: { select: { departmentId: true } },
        },
      },
    },
  });
  if (departments.length === 0) return [];
  const departmentIds = departments.map((department) => department.id);

  const [primaryGms, operators] = await Promise.all([
    db.employee.findMany({
      where: {
        facilityId: input.facilityId,
        roleType: RoleKey.GM,
        status: { not: EmployeeStatus.TERMINATED },
        primaryDepartmentId: { in: departmentIds },
      },
      select: { primaryDepartmentId: true },
    }),
    loadCurrentOperatorsForFacilityDepartments(db, {
      facilityId: input.facilityId,
      departmentIds,
      now: input.now,
    }),
  ]);
  const gmDepartmentIds = new Set(primaryGms.map((row) => row.primaryDepartmentId));

  const result: DepartmentNeedingHead[] = [];
  for (const department of departments) {
    if ((operators.get(department.id)?.operatingModel ?? "FACILITY_OPERATED") !== "FACILITY_OPERATED") continue;
    const status = deriveDepartmentHeadStatus({
      departmentId: department.id,
      recordedHead: department.headEmployee,
      hasActivePrimaryGm: gmDepartmentIds.has(department.id),
    });
    if (status === "HEADED") continue;
    result.push({
      departmentId: department.id,
      name: department.name,
      status,
      formerHeadName:
        status === "HEAD_LEFT" && department.headEmployee
          ? `${department.headEmployee.firstName} ${department.headEmployee.lastName}`.trim()
          : null,
    });
  }
  return result;
}
