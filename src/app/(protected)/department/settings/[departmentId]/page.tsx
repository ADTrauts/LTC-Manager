import Link from "next/link";
import { redirect } from "next/navigation";

import { setDepartmentHeadAction } from "@/app/(protected)/admin/departments/actions";
import { getSession } from "@/lib/auth";
import { assertVisibleDepartment, loadDepartmentStaffManagerChoices, resolveDepartmentAccess } from "@/lib/department-authority";
import { canManageDepartmentHeadSettings } from "@/lib/dept-settings-access";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { prisma } from "@/lib/prisma";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";
import { resolveWorkspaceHomeHref } from "@/lib/shell/workspace-home";
import { EmployeeStatus } from "@prisma/client";

import { StaffManagerToggle } from "./staff-manager-toggle";

type PageProps = { params: Promise<{ departmentId: string }> };

export default async function DepartmentSettingsPage({ params }: PageProps) {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const { departmentId } = await params;
  const facilityId = session.facilityId;
  await assertVisibleDepartment(prisma, session, facilityId, departmentId);

  if (!(await canManageDepartmentHeadSettings(session, departmentId))) {
    redirect(resolveWorkspaceHomeHref(session));
  }

  const [department, employees, access, sessionEmployeeId, staffManagers] = await Promise.all([
    prisma.department.findFirst({
      where: { id: departmentId, facilityId, isActive: true },
      select: {
        id: true,
        key: true,
        name: true,
        showInEmployeeApp: true,
        headEmployeeId: true,
        headEmployee: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.employee.findMany({
      where: { facilityId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        primaryDepartmentId: true,
        employeeDepartments: { select: { departmentId: true } },
      },
    }),
    resolveDepartmentAccess(prisma, session, { facilityId, departmentId }),
    getOperationalEmployeeIdForSession(session),
    loadDepartmentStaffManagerChoices(prisma, { facilityId, departmentId }),
  ]);

  if (!department) {
    redirect(resolveWorkspaceHomeHref(session));
  }

  const departmentKey = department.id;

  function isOnDeptRoster(e: (typeof employees)[number]): boolean {
    return (
      e.primaryDepartmentId === departmentKey ||
      e.employeeDepartments.some((x) => x.departmentId === departmentKey)
    );
  }

  const activeEmployees = employees
    .filter((e) => e.status !== EmployeeStatus.TERMINATED)
    .sort((a, b) => `${a.lastName}, ${a.firstName}`.localeCompare(`${b.lastName}, ${b.firstName}`));

  const fa = isFacilityAdministratorRole(session.role);
  const isHead = access?.isHead ?? false;
  const employeeLabel = (e: (typeof employees)[number]) =>
    `${e.lastName}, ${e.firstName}${e.id === sessionEmployeeId ? " (you)" : ""}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm text-zinc-500">
          {fa ? (
            <Link href="/admin/departments" className="font-medium text-zinc-700 hover:text-zinc-900">
              Admin
            </Link>
          ) : (
            <Link href="/dashboard" className="font-medium text-zinc-700 hover:text-zinc-900">
              Dashboard
            </Link>
          )}
          <span className="mx-1.5 text-zinc-400">/</span>
          <span className="text-zinc-600">Department</span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{department.name} settings</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Department heads can assign the operational lead for this department and update the roster elsewhere under
          Employees. Visibility in the HR app for this department can only be changed by a Facility Administrator.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white px-4 py-5 shadow-sm sm:px-6">
        <h2 className="text-sm font-semibold text-zinc-900">App visibility</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {department.showInEmployeeApp ? (
            <span>This department is visible in Employee HR flows.</span>
          ) : (
            <span className="text-amber-800">Hidden from Employee HR flows.</span>
          )}
          {fa ? (
            <>
              {" "}
              Manage under{" "}
              <Link href="/admin/departments" className="font-medium text-zinc-800 underline hover:text-zinc-950">
                Admin → Departments
              </Link>
              .
            </>
          ) : null}
        </p>
      </section>

      {department.showInEmployeeApp ? (
        <section className="rounded-xl border border-zinc-200 bg-white px-4 py-5 shadow-sm sm:px-6">
          <h2 className="text-sm font-semibold text-zinc-900">Department head</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Head:{" "}
            {department.headEmployee?.firstName && department.headEmployee?.lastName
              ? `${department.headEmployee.lastName}, ${department.headEmployee.firstName}`
              : "Not assigned"}
          </p>
          <form action={setDepartmentHeadAction} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="departmentId" value={department.id} />
            <label className="text-xs font-medium text-zinc-700">
              Assign head
              <select
                name="headEmployeeId"
                defaultValue={department.headEmployeeId ?? ""}
                className="mt-1 block min-w-[12rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Not assigned</option>
                {(() => {
                  const onRoster = activeEmployees.filter((e) => isOnDeptRoster(e));
                  const elsewhere = activeEmployees.filter((e) => !isOnDeptRoster(e));
                  return (
                    <>
                      {onRoster.length > 0 ? (
                        <optgroup label={`On ${department.name} roster`}>
                          {onRoster.map((e) => (
                            <option key={e.id} value={e.id}>
                              {employeeLabel(e)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {elsewhere.length > 0 ? (
                        <optgroup label="Other employees (saving adds them to this department)">
                          {elsewhere.map((e) => (
                            <option key={e.id} value={e.id}>
                              {employeeLabel(e)}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </>
                  );
                })()}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
            >
              Save head
            </button>
          </form>
        </section>
      ) : null}

      {department.showInEmployeeApp ? (
        <section
          className="rounded-xl border border-zinc-200 bg-white px-4 py-5 shadow-sm sm:px-6"
          data-testid="department-staff-managers"
        >
          <h2 className="text-sm font-semibold text-zinc-900">Managers who add staff</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {isHead
              ? "Choose which managers may add staff to this department and set their roles."
              : "The department head chooses which managers may add staff and set roles."}
          </p>
          {staffManagers.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No managers in this department yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100">
              {staffManagers.map((manager) =>
                isHead ? (
                  <StaffManagerToggle
                    key={manager.employeeId}
                    departmentId={department.id}
                    employeeId={manager.employeeId}
                    name={manager.name}
                    allowed={manager.allowed}
                  />
                ) : (
                  <li key={manager.employeeId} className="py-2 text-sm text-zinc-900">
                    {manager.name}
                    <span className="ml-2 text-xs text-zinc-500">
                      {manager.allowed ? "May add staff and set roles" : "Does not add staff or set roles"}
                    </span>
                  </li>
                ),
              )}
            </ul>
          )}
        </section>
      ) : (
        <p className="text-sm text-zinc-600">Turn this department on under Admin before assigning a head.</p>
      )}
    </div>
  );
}
