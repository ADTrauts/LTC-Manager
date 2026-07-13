import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { BusinessWorkspaceScreen } from "@/components/business-workspace/business-workspace-view";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession, sessionUserIdForFk } from "@/lib/auth";
import {
  canAccessBusinessWorkspace,
  loadBusinessWorkspace,
} from "@/lib/business-workspace";
import { getFacilityForSession } from "@/lib/facility-context";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { prisma } from "@/lib/prisma";

export default async function WorkspacePage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }

  if (!canAccessBusinessWorkspace(session.role)) {
    redirect(
      resolveDefaultHomePath({
        authKind: session.authKind,
        role: session.role,
        activeUnitId: session.activeUnitId,
      }),
    );
  }

  const cookieStore = await cookies();
  const deptNav = await resolveActiveDepartmentForShell(session, cookieStore);
  const facility = await getFacilityForSession();

  let departmentName: string | null = null;
  if (deptNav.activeDepartmentId) {
    const dept = await prisma.department.findFirst({
      where: { id: deptNav.activeDepartmentId, facilityId: session.facilityId },
      select: { name: true },
    });
    departmentName = dept?.name ?? null;
  } else if (deptNav.showAllDepartmentNav) {
    departmentName = "All departments";
  }

  const view = await loadBusinessWorkspace({
    facilityId: session.facilityId,
    facilityName: facility?.displayName ?? "Facility",
    userDisplayName: session.name,
    role: session.role,
    userId: sessionUserIdForFk(session),
    activeDepartmentKey: deptNav.activeOperationalDepartmentKey,
    activeDepartmentName: departmentName,
  });

  if (!view) {
    redirect("/dashboard");
  }

  return <BusinessWorkspaceScreen view={view} />;
}
