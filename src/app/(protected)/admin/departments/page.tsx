import Link from "next/link";
import { redirect } from "next/navigation";

import { setDepartmentHeadAction } from "@/app/(protected)/admin/departments/actions";
import { DepartmentVisibilityForm } from "@/app/(protected)/admin/departments/department-visibility-form";
import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { getSession } from "@/lib/auth";
import { ensureDefaultDepartments } from "@/lib/ensure-default-departments";
import {
  isDepartmentOperationalProfilesEnabled,
  isDietaryOperationalCyclesEnabled,
} from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { EmployeeStatus } from "@prisma/client";

export default async function AdminDepartmentsPage() {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  const facilityId = session.facilityId;
  const profilesEnabled = isDepartmentOperationalProfilesEnabled();
  const cyclesEnabled = isDietaryOperationalCyclesEnabled();
  const departmentAdminEnabled = profilesEnabled || cyclesEnabled;

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
    return (
      e.primaryDepartmentId === departmentId ||
      e.employeeDepartments.some((x) => x.departmentId === departmentId)
    );
  }

  function assignedEmployeeCount(departmentId: string) {
    return employees.filter((e) => isOnDepartmentRoster(e, departmentId)).length;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AdminPageHeader
        title="Departments"
        trail={[{ label: "Departments" }]}
        subtitle="Manage department visibility in the employee application and operational mode selector, assign department heads, and open department-specific operational settings. Dietary, EVS, and Plant Operations are available for every facility. This does not purchase or license modules."
      />

      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-sm">
        {departments.map((d) => (
          <li key={d.id} className="px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  {departmentAdminEnabled ? (
                    <Link
                      href={
                        profilesEnabled
                          ? `/admin/departments/${d.id}`
                          : `/admin/departments/${d.id}?tab=cycles`
                      }
                      className="hover:underline"
                    >
                      {d.name}
                    </Link>
                  ) : (
                    d.name
                  )}
                </p>
                <p className="text-xs text-zinc-500">
                  Key <span className="font-mono">{d.key}</span>
                  {d.showInEmployeeApp ? (
                    <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
                      Shown in employee app
                    </span>
                  ) : (
                    <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">
                      Hidden from employee app
                    </span>
                  )}
                </p>
                <p className="mt-2 text-sm text-zinc-600">
                  Head:{" "}
                  {d.headEmployee?.firstName && d.headEmployee?.lastName
                    ? `${d.headEmployee.lastName}, ${d.headEmployee.firstName}`
                    : "Not assigned"}
                </p>
                {departmentAdminEnabled ? (
                  <p className="mt-2">
                    <Link
                      href={
                        profilesEnabled
                          ? `/admin/departments/${d.id}`
                          : `/admin/departments/${d.id}?tab=cycles`
                      }
                      className="text-xs font-medium text-zinc-800 underline-offset-2 hover:underline"
                    >
                      {profilesEnabled
                        ? "Open Department Administration →"
                        : "Open Operational Cycles →"}
                    </Link>
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-3 sm:items-end">
                <DepartmentVisibilityForm
                  departmentId={d.id}
                  showInEmployeeApp={d.showInEmployeeApp}
                  assignedEmployeeCount={assignedEmployeeCount(d.id)}
                />
                {d.showInEmployeeApp ? (
                  <form action={setDepartmentHeadAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="departmentId" value={d.id} />
                    <label className="text-xs font-medium text-zinc-700">
                      Department head
                      <select
                        name="headEmployeeId"
                        defaultValue={d.headEmployeeId ?? ""}
                        className="mt-1 block min-w-[12rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="">Not assigned</option>
                        {(() => {
                          const onRoster = activeEmployees.filter((e) => isOnDepartmentRoster(e, d.id));
                          const elsewhere = activeEmployees.filter((e) => !isOnDepartmentRoster(e, d.id));
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
                                <optgroup
                                  label={
                                    onRoster.length > 0
                                      ? "Other employees (saving adds them to this department)"
                                      : "Employees (saving adds them to this department if needed)"
                                  }
                                >
                                  {elsewhere.map((e) => (
                                    <option key={e.id} value={e.id}>
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
                      Save head
                    </button>
                    {activeEmployees.length === 0 ? (
                      <p className="max-w-xs text-xs text-amber-800">
                        There are no active employees in this facility yet. Add people under Employees, then return here
                        to assign a head.
                      </p>
                    ) : null}
                  </form>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
