import assert from "node:assert/strict";
import test from "node:test";
import { RoleKey, type PrismaClient } from "@prisma/client";

import { resolveLedDepartmentIds } from "./led-departments";

type EmployeeRow = { id: string; facilityId: string; roleType: RoleKey; primaryDepartmentId: string | null };
type DepartmentRow = { id: string; facilityId: string; headEmployeeId: string | null };

function fakeDb(employees: EmployeeRow[], departments: DepartmentRow[]): PrismaClient {
  return {
    employee: {
      findFirst: async ({ where }: { where: { id: string; facilityId: string } }) =>
        employees.find((row) => row.id === where.id && row.facilityId === where.facilityId) ?? null,
    },
    department: {
      findFirst: async ({ where }: { where: { id: string; facilityId: string } }) =>
        departments.find((row) => row.id === where.id && row.facilityId === where.facilityId) ?? null,
      findMany: async ({ where }: { where: { facilityId: string; headEmployeeId: string } }) =>
        departments
          .filter((row) => row.facilityId === where.facilityId && row.headEmployeeId === where.headEmployeeId)
          .map((row) => ({ id: row.id })),
    },
  } as unknown as PrismaClient;
}

/** `canManageDepartmentHeadSettings` before it moved onto `resolveLedDepartmentIds`, after the shared guards. */
async function previousHeadSettingsRule(
  db: PrismaClient,
  facilityId: string,
  employeeId: string,
  departmentId: string,
): Promise<boolean> {
  const department = await db.department.findFirst({
    where: { id: departmentId, facilityId },
    select: { headEmployeeId: true },
  });
  if (department?.headEmployeeId === employeeId) return true;
  const employee = await db.employee.findFirst({
    where: { id: employeeId, facilityId },
    select: { roleType: true, primaryDepartmentId: true },
  });
  return Boolean(employee?.roleType === RoleKey.GM && employee.primaryDepartmentId === departmentId);
}

test("head settings: the led-Department predicate decides exactly as the previous rule", async () => {
  const facilityId = "fac-1";
  const departmentIds = ["dept-a", "dept-b", "dept-elsewhere"];
  const roles = [RoleKey.GM, RoleKey.MANAGER, RoleKey.SUPERVISOR, RoleKey.STAFF];
  const primaries = ["dept-a", "dept-b", null];
  const headships: (readonly string[])[] = [[], ["dept-a"], ["dept-b"], ["dept-a", "dept-b"], ["dept-elsewhere"]];
  const employeeFacilities = [facilityId, "fac-2"];
  let cases = 0;

  for (const roleType of roles) {
    for (const primaryDepartmentId of primaries) {
      for (const heads of headships) {
        for (const employeeFacility of employeeFacilities) {
          const employees: EmployeeRow[] = [
            { id: "emp-1", facilityId: employeeFacility, roleType, primaryDepartmentId },
            { id: "emp-other", facilityId, roleType: RoleKey.GM, primaryDepartmentId: "dept-b" },
          ];
          const departments: DepartmentRow[] = departmentIds.map((id) => ({
            id,
            facilityId: id === "dept-elsewhere" ? "fac-2" : facilityId,
            headEmployeeId: heads.includes(id) ? "emp-1" : id === "dept-b" ? "emp-other" : null,
          }));
          const db = fakeDb(employees, departments);
          const led = await resolveLedDepartmentIds(db, { facilityId, employeeId: "emp-1" });
          for (const departmentId of departmentIds) {
            const label = JSON.stringify({ roleType, primaryDepartmentId, heads, employeeFacility, departmentId });
            assert.equal(
              led.includes(departmentId),
              await previousHeadSettingsRule(db, facilityId, "emp-1", departmentId),
              label,
            );
            cases += 1;
          }
        }
      }
    }
  }
  assert.equal(cases, roles.length * primaries.length * headships.length * employeeFacilities.length * departmentIds.length);
});
