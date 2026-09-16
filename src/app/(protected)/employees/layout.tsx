import { Suspense } from "react";
import { redirect } from "next/navigation";

import { EmployeesSubNav } from "@/components/employees-sub-nav";
import { getSession } from "@/lib/auth";
import { ensureDefaultDepartments } from "@/lib/ensure-default-departments";
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

  return (
    <div className="space-y-3">
      <Suspense fallback={null}>
        <EmployeesSubNav role={session.role} />
      </Suspense>
      {children}
    </div>
  );
}
