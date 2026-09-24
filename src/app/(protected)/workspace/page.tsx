import Link from "next/link";
import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";

import { BusinessWorkspaceScreen } from "@/components/business-workspace/business-workspace-view";
import { PageHeader } from "@/components/design-system/page-header";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession, sessionUserIdForFk } from "@/lib/auth";
import { canAccessBusinessWorkspace } from "@/lib/business-workspace";
import { loadBusinessWorkspace } from "@/lib/business-workspace/load-business-workspace";
import { loadDashboardRuntime } from "@/lib/business-workspace/dashboard";
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

type WorkspacePageProps = {
  searchParams?: Promise<{
    onboarding?: string | string[] | undefined;
  }>;
};

function OnboardingLaunchChecklist() {
  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <h2 className="text-lg font-semibold text-emerald-900">Setup complete</h2>
      <p className="mt-1 text-sm text-emerald-800">
        Your workspace is ready. Use this checklist to finish launch tasks.
      </p>
      <ul className="mt-3 space-y-1 text-sm text-emerald-900">
        <li>
          Add managers in{" "}
          <Link href="/employees" className="font-medium underline">
            Employees
          </Link>
          .
        </li>
        <li>Confirm locations and serving units in Locations.</li>
        <li>Assign route permissions for each role in Administration.</li>
      </ul>
    </section>
  );
}

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  noStore();

  const query = searchParams ? await searchParams : {};
  const onboardingComplete =
    typeof query.onboarding === "string" && query.onboarding === "complete";

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

  const dashboardRuntime = await loadDashboardRuntime(session);

  const workspaceInput = {
    facilityId: session.facilityId,
    facilityName: facility?.displayName ?? "Facility",
    userDisplayName: session.name,
    role: session.role,
    userId: sessionUserIdForFk(session),
    activeDepartmentKey: deptNav.activeOperationalDepartmentKey,
    activeDepartmentId: deptNav.activeDepartmentId,
    activeDepartmentName: departmentName,
    dashboardRuntime,
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

    return (
      <>
        {onboardingComplete ? <OnboardingLaunchChecklist /> : null}
        <BusinessWorkspaceScreen view={assembled.view} />
      </>
    );
  }

  const view = await loadBusinessWorkspace(workspaceInput);

  if (!view) {
    return (
      <WorkspaceProjectionUnavailable message="Business Workspace could not be composed for this session." />
    );
  }

  return (
    <>
      {onboardingComplete ? <OnboardingLaunchChecklist /> : null}
      <BusinessWorkspaceScreen view={view} />
    </>
  );
}
