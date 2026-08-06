import { redirect } from "next/navigation";

import { type AppRole, hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";

type AdminLayoutProps = {
  children: React.ReactNode;
};

/**
 * Phase 9A: Department Builder (`/admin/departments*`) admits Manager+ for
 * Operational Cycles. Other admin pages re-assert Facility Administrator where required.
 */
export default async function AdminLayout({ children }: AdminLayoutProps) {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  if (!hasAtLeastRole(session.role as AppRole, "MANAGER")) {
    redirect("/dashboard");
  }
  return <>{children}</>;
}
