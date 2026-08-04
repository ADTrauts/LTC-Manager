import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmployeesDepartmentTabs } from "@/components/employees-department-tabs";
import { EmployeesSubNav } from "@/components/employees-sub-nav";
import { getSession } from "@/lib/auth";
import { ensureDefaultDepartments } from "@/lib/ensure-default-departments";
import { loadEmployeeAppDepartments } from "@/lib/employees-department-tabs";
import { prisma } from "@/lib/prisma";

type EmployeesLayoutProps = {
  children: React.ReactNode;
};

export default async function EmployeesLayout({ children }: EmployeesLayoutProps) {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const facilityId = session.facilityId;
  if ((await prisma.department.count({ where: { facilityId } })) === 0) {
    await ensureDefaultDepartments(prisma, facilityId);
  }

  const departments = await loadEmployeeAppDepartments(prisma, facilityId);

  return (
    <div className="space-y-6">
      {departments.length > 0 ? (
        <Suspense fallback={<div className="h-10 border-b border-transparent" aria-hidden />}>
          <EmployeesDepartmentTabs departments={departments} />
        </Suspense>
      ) : null}
      <Suspense fallback={null}>
        <EmployeesSubNav role={session.role} />
      </Suspense>
      {children}
    </div>
  );
}
