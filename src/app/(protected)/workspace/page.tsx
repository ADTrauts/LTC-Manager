import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { BusinessWorkspaceScreen } from "@/components/business-workspace/business-workspace-view";
import { PageHeader } from "@/components/design-system/page-header";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession, sessionUserIdForFk } from "@/lib/auth";
import {
  canAccessBusinessWorkspace,
  loadBusinessWorkspace,
} from "@/lib/business-workspace";
import { assembleProjectedBusinessWorkspace } from "@/lib/business-workspace/projection/load";
import { isProjectionBusinessWorkspaceEnabled } from "@/lib/feature-flags";
import { getFacilityForSession } from "@/lib/facility-context";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { createProjectionRuntimeRequestScope } from "@/lib/projection";
import { prisma } from "@/lib/prisma";

function WorkspaceProjectionUnavailable({ message }: { message: string }) {
  return (
    <section className="space-y-6">
      <PageHeader
        icon="operationsCenter"
        title="Workspace"
        subtitle="Your personal operational priorities."
        compact
      />
      <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-6">
        <h2 className="text-lg font-semibold text-zinc-900">
          Workspace unavailable
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          Configuration could not be resolved for this session. Operational data
          was not loaded.
        </p>
        <p className="mt-3 text-xs text-zinc-500">{message}</p>
      </section>
    </section>
  );
}

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

  const workspaceInput = {
    facilityId: session.facilityId,
    facilityName: facility?.displayName ?? "Facility",
    userDisplayName: session.name,
    role: session.role,
    userId: sessionUserIdForFk(session),
    activeDepartmentKey: deptNav.activeOperationalDepartmentKey,
    activeDepartmentId: deptNav.activeDepartmentId,
    activeDepartmentName: departmentName,
  };

  if (isProjectionBusinessWorkspaceEnabled()) {
    const assembled = await assembleProjectedBusinessWorkspace(
      session,
      workspaceInput,
      {
        memo: createProjectionRuntimeRequestScope(),
        activeDepartmentKey: deptNav.activeOperationalDepartmentKey,
      },
    );

    if (assembled.error || !assembled.view) {
      return (
        <WorkspaceProjectionUnavailable
          message={
            assembled.error ?? "Business Workspace Projection is not available."
          }
        />
      );
    }

    return <BusinessWorkspaceScreen view={assembled.view} />;
  }

  const view = await loadBusinessWorkspace(workspaceInput);

  if (!view) {
    redirect("/dashboard");
  }

  return <BusinessWorkspaceScreen view={view} />;
}
