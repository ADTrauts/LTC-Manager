import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { setDepartmentHeadAction } from "@/app/(protected)/admin/departments/actions";
import { DepartmentVisibilityForm } from "@/app/(protected)/admin/departments/department-visibility-form";
import { BuildPageHeader } from "@/components/build/build-breadcrumb";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import {
  departmentBuilderWorkspaceHref,
  shouldRedirectDepartmentsListToWorkspace,
} from "@/lib/department-administration";
import { ensureDefaultDepartments } from "@/lib/ensure-default-departments";
import { employeeBelongsToDepartment } from "@/lib/employee-membership";
import { prisma } from "@/lib/prisma";
import { EmployeeStatus } from "@prisma/client";

type PageProps = {
  searchParams: Promise<{ all?: string }>;
};

/**
 * Facility-level “All Departments” management.
 * When a global department is selected, redirects into that department’s Builder
 * unless `?all=1` forces this management list.
 */
export default async function AdminDepartmentsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;
  const query = await searchParams;
  const forceAll = query.all === "1";

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  if (
    shouldRedirectDepartmentsListToWorkspace({
      activeDepartmentId: deptNav.activeDepartmentId,
      forceAllDepartments: forceAll,
    })
  ) {
    redirect(departmentBuilderWorkspaceHref(deptNav.activeDepartmentId!));
  }

  if ((await prisma.department.count({ where: { facilityId } })) === 0) {
    await ensureDefaultDepartments(prisma, facilityId);
  }

  const [departments, employees] = await Promise.all([
    prisma.department.findMany({
      where: { facilityId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
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
  ]);

  const activeEmployees = employees
    .filter((e) => e.status !== EmployeeStatus.TERMINATED)
    .sort((a, b) =>
      `${a.lastName}, ${a.firstName}`.localeCompare(`${b.lastName}, ${b.firstName}`),
    );

  function isOnDepartmentRoster(e: (typeof employees)[number], departmentId: string) {
    return employeeBelongsToDepartment(e, departmentId);
  }

  function assignedEmployeeCount(departmentId: string) {
    return employees.filter((e) => isOnDepartmentRoster(e, departmentId)).length;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="departments-all-list">
      <BuildPageHeader
        title="All Departments"
        subtitle="Facility-wide visibility and Department Managers. Pick a department in the header, or open one below, to use Department Builder (Overview · Locations · Teams · Operational Cycles)."
      />

      <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
        The global Department control is set to <span className="font-medium">All departments</span>.
        Department Builder tabs appear after you open a specific department.
      </p>

      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
        {departments.map((d) => (
          <li key={d.id} className="px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900">{d.name}</p>
                <p className="text-xs text-zinc-500">
                  Key <span className="font-mono">{d.key}</span>
                  {d.showInEmployeeApp ? (
                    <span className="ml-2 text-emerald-800">Shown in employee app</span>
                  ) : (
                    <span className="ml-2 text-zinc-600">Hidden from employee app</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  Department Manager:{" "}
                  {d.headEmployee?.firstName && d.headEmployee?.lastName
                    ? `${d.headEmployee.lastName}, ${d.headEmployee.firstName}`
                    : "Not assigned"}
                </p>
                <p className="mt-3">
                  <Link
                    href={departmentBuilderWorkspaceHref(d.id)}
                    className="inline-flex rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                    data-testid="open-department-builder"
                  >
                    Open Department Builder →
                  </Link>
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:items-end">
                <DepartmentVisibilityForm
                  departmentId={d.id}
                  showInEmployeeApp={d.showInEmployeeApp}
                  assignedEmployeeCount={assignedEmployeeCount(d.id)}
                />
                <form action={setDepartmentHeadAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="departmentId" value={d.id} />
                  <label className="text-xs font-medium text-zinc-700">
                    Department Manager
                    <select
                      name="headEmployeeId"
                      defaultValue={d.headEmployeeId ?? ""}
                      className="mt-1 block min-w-[12rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="">Not assigned</option>
                      {(() => {
                        const onRoster = activeEmployees.filter((e) =>
                          isOnDepartmentRoster(e, d.id),
                        );
                        const elsewhere = activeEmployees.filter(
                          (e) => !isOnDepartmentRoster(e, d.id),
                        );
                        return (
                          <>
                            {onRoster.length > 0 ? (
                              <optgroup label={`On ${d.name} roster`}>
                                {onRoster.map((e) => (
                                  <option key={e.id} value={e.id}>
                                    {e.lastName}, {e.firstName}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                            {elsewhere.length > 0 ? (
                              <optgroup label="Other employees — add Department membership in Employee Builder first">
                                {elsewhere.map((e) => (
                                  <option key={e.id} value={e.id} disabled>
                                    {e.lastName}, {e.firstName}
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
                    Save manager
                  </button>
                </form>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
