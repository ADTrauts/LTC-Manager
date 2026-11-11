import { redirect } from "next/navigation";

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
      {children}
    </div>
  );
}
