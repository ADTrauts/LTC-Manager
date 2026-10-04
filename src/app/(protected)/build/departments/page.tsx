import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import {
  adminDepartmentsHrefFromLegacyBuildQuery,
  departmentBuilderWorkspaceHref,
} from "@/lib/department-administration";
import { loadCustomerOperableDepartments } from "@/lib/department-products";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams: Promise<{
    all?: string;
    marketplace?: string;
    checkout?: string;
    session_id?: string;
  }>;
};

/**
 * Build → Department Builder entry.
 * Opens the selected Department. Legacy management/marketplace queries go to Admin.
 */
export default async function BuildDepartmentsEntryPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  const query = await searchParams;
  const legacyManagement = query.all === "1" || query.marketplace === "1";
  if (legacyManagement) {
    if (isFacilityAdministratorRole(session.role)) {
      redirect(
        adminDepartmentsHrefFromLegacyBuildQuery({
          marketplace: query.marketplace === "1",
          all: query.all === "1",
        }),
      );
    }
    redirect("/build");
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  if (deptNav.activeDepartmentId) {
    redirect(departmentBuilderWorkspaceHref(deptNav.activeDepartmentId));
  }

  const operable = await loadCustomerOperableDepartments(prisma, session.facilityId);
  const fallback = operable[0];
  if (fallback) {
    redirect(departmentBuilderWorkspaceHref(fallback.id));
  }

  if (isFacilityAdministratorRole(session.role)) {
    redirect("/admin/departments");
  }
  redirect("/build");
}
