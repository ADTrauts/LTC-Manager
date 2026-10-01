import { Suspense } from "react";
import { redirect } from "next/navigation";

import { EmployeesSubNav } from "@/components/employees-sub-nav";
import { getSession } from "@/lib/auth";

type EmployeesLayoutProps = {
  children: React.ReactNode;
};

export default async function EmployeesLayout({ children }: EmployeesLayoutProps) {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
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
