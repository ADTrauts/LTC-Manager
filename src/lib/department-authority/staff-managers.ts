import { RoleKey, type Prisma, type PrismaClient } from "@prisma/client";

import { employeeBelongsToDepartmentWhere } from "@/lib/employee-membership/department";

import { isActiveDepartmentMember, type DepartmentHeadCandidate } from "./heads";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Head-allowed managers (CDA-D03): the head marks which managers may add staff and set roles.
 * Only an active Manager member other than the recorded head can be marked, and a mark counts
 * only while that stays true.
 */
export function isStaffManagerEligible(input: {
  departmentId: string;
  headEmployeeId: string | null;
  employee: DepartmentHeadCandidate & { id: string; roleType: RoleKey };
}): boolean {
  return (
    input.employee.roleType === RoleKey.MANAGER &&
    input.employee.id !== input.headEmployeeId &&
    isActiveDepartmentMember(input.employee, input.departmentId)
  );
}

const candidateSelect = {
  id: true,
  firstName: true,
  lastName: true,
  roleType: true,
  status: true,
  primaryDepartmentId: true,
  employeeDepartments: { select: { departmentId: true } },
} as const;

export type DepartmentStaffManagerChoice = {
  employeeId: string;
  name: string;
  allowed: boolean;
};

/** The Department's eligible managers, each with whether the head has allowed them. */
export async function loadDepartmentStaffManagerChoices(
  db: DbClient,
  input: { facilityId: string; departmentId: string },
): Promise<DepartmentStaffManagerChoice[]> {
  const department = await db.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId },
    select: { headEmployeeId: true, staffManagers: { select: { employeeId: true } } },
  });
  if (!department) return [];
  const managers = await db.employee.findMany({
    where: {
      facilityId: input.facilityId,
      roleType: RoleKey.MANAGER,
      ...employeeBelongsToDepartmentWhere(input.departmentId),
    },
    select: candidateSelect,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const allowed = new Set(department.staffManagers.map((row) => row.employeeId));
  return managers
    .filter((employee) =>
      isStaffManagerEligible({
        departmentId: input.departmentId,
        headEmployeeId: department.headEmployeeId,
        employee,
      }),
    )
    .map((employee) => ({
      employeeId: employee.id,
      name: `${employee.lastName}, ${employee.firstName}`,
      allowed: allowed.has(employee.id),
    }));
}

/** Employee ids whose head-allowed mark currently counts. */
export async function resolveDepartmentStaffManagerIds(
  db: DbClient,
  input: { facilityId: string; departmentId: string },
): Promise<string[]> {
  const choices = await loadDepartmentStaffManagerChoices(db, input);
  return choices.filter((choice) => choice.allowed).map((choice) => choice.employeeId);
}

export class DepartmentStaffManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DepartmentStaffManagerError";
  }
}

/** Caller has already established that the actor is the Department's head. */
export async function setDepartmentStaffManager(
  db: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    employeeId: string;
    allowed: boolean;
    grantedByEmployeeId: string | null;
  },
): Promise<void> {
  if (!input.allowed) {
    await db.departmentStaffManager.deleteMany({
      where: { departmentId: input.departmentId, employeeId: input.employeeId },
    });
    return;
  }
  const [department, employee] = await Promise.all([
    db.department.findFirst({
      where: { id: input.departmentId, facilityId: input.facilityId },
      select: { headEmployeeId: true },
    }),
    db.employee.findFirst({
      where: { id: input.employeeId, facilityId: input.facilityId },
      select: candidateSelect,
    }),
  ]);
  if (!department) throw new DepartmentStaffManagerError("Department not found.");
  if (
    !employee ||
    !isStaffManagerEligible({
      departmentId: input.departmentId,
      headEmployeeId: department.headEmployeeId,
      employee,
    })
  ) {
    throw new DepartmentStaffManagerError("Only an active Manager in this Department can be allowed.");
  }
  await db.departmentStaffManager.upsert({
    where: {
      departmentId_employeeId: { departmentId: input.departmentId, employeeId: input.employeeId },
    },
    create: {
      departmentId: input.departmentId,
      employeeId: input.employeeId,
      grantedByEmployeeId: input.grantedByEmployeeId,
    },
    update: {},
  });
}
