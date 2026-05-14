import { redirect } from "next/navigation";

import { EmployeesSubNav } from "@/components/employees-sub-nav";
import { getSession } from "@/lib/auth";

type EmployeesLayoutProps = {
  children: React.ReactNode;
};

export default async function EmployeesLayout({ children }: EmployeesLayoutProps) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <EmployeesSubNav role={session.role} />
      {children}
    </div>
  );
}
