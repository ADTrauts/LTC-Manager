import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { JobRolesWorkspace } from "@/app/(protected)/employees/job-roles/job-roles-workspace";
import { getSession } from "@/lib/auth";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import {
  loadJobRolesForDepartment,
  resolveJobRoleAuthority,
} from "@/lib/department-job-roles";
import { prisma } from "@/lib/prisma";

export default async function JobRolesPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);

  if (!deptNav.activeDepartmentId) {
    return (
      <section className="space-y-3" data-testid="job-roles-select-department">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Job Roles</h1>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
          <p className="font-medium text-zinc-900">Select a Department to manage its Job Roles.</p>
          <p className="mt-2">
            Job Roles are owned by a Department. Use the Department selector in the app shell, then return here.
          </p>
        </div>
      </section>
    );
  }

  const department = await prisma.department.findFirst({
    where: { id: deptNav.activeDepartmentId, facilityId: session.facilityId, isActive: true },
    select: { id: true, name: true },
  });
  if (!department) {
    redirect("/employees/job-roles");
  }

  const authority = await resolveJobRoleAuthority(session, session.facilityId, department.id);
  if (!authority.canView) {
    redirect("/employees");
  }

  const roles = await loadJobRolesForDepartment(prisma, {
    facilityId: session.facilityId,
    departmentId: department.id,
  });

  return (
    <JobRolesWorkspace
      departmentId={department.id}
      departmentName={department.name}
      roles={roles}
      canManage={authority.canManage}
    />
  );
}
