import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { AppCard } from "@/components/design-system/AppCard";
import { PageHeader } from "@/components/design-system/page-header";
import { OperatingLocationWalkList } from "@/components/todays-work/operating-location-board";
import { TodaysWorkRunOperationBanner } from "@/components/todays-work/todays-work-run-operation-banner";
import { TodaysWorkScopeLabel, TodaysWorkTeamUnconfigured } from "@/components/todays-work/todays-work-scope";
import { WalkListSummaryCards } from "@/components/todays-work/walk-list-summary";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { departmentAdminHref } from "@/lib/department-administration/admin-nav";
import {
  isCurrentPeriodModel,
  loadDepartmentRunPresentation,
} from "@/lib/operational-cycles";
import { resolveWorkspaceHomeHref } from "@/lib/shell/workspace-home";
import {
  isTeamUnconfiguredScope,
  keyTimeSpaceFilterFromTeamScope,
  loadOperatingLocationBoard,
} from "@/lib/todays-work";

export async function RoundsScreen() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect(resolveWorkspaceHomeHref(session));
  }

  const deptNav = await resolveActiveDepartmentForShell(session, await cookies());
  const activeDepartmentKey = deptNav.activeOperationalDepartmentKey;

  const operating = await loadOperatingLocationBoard(session.facilityId, {
    session,
    activeDepartmentKey,
    activeDepartmentId: deptNav.activeDepartmentId,
  });
  const runPresentation = deptNav.activeDepartmentId
    ? await loadDepartmentRunPresentation({
        session,
        facilityId: session.facilityId,
        departmentId: deptNav.activeDepartmentId,
        spaceIdFilter: keyTimeSpaceFilterFromTeamScope(operating.teamScope),
      })
    : null;
  const builderHref =
    deptNav.activeDepartmentId && hasAtLeastRole(session.role, "MANAGER")
      ? departmentAdminHref(deptNav.activeDepartmentId, "people")
      : null;
  const operationBanner =
    runPresentation && isCurrentPeriodModel(runPresentation.provenance) ? (
      <TodaysWorkRunOperationBanner presentation={runPresentation} builderHref={builderHref} />
    ) : runPresentation?.provenance === "LEGACY_MEAL_SERVICE" ? (
      <OperationContextBanner context={operating.operationContext} embedded />
    ) : null;
  const teamUnconfigured = isTeamUnconfiguredScope(operating.teamScope);

  return (
    <section className="mx-auto max-w-5xl space-y-6" data-testid="locations-rounds">
      <PageHeader
        icon="todaysWork"
        eyebrow="Locations"
        title="Rounds"
        subtitle="If you are making rounds, where should you go first?"
        actions={
          <Link
            href="/units"
            className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
          >
            Back to Locations
          </Link>
        }
        below={
          <>
            <TodaysWorkScopeLabel scope={operating.teamScope} locationCount={operating.walkLocations.length} />
            {teamUnconfigured ? null : operationBanner}
          </>
        }
      />
      {teamUnconfigured && operating.teamScope ? (
        <TodaysWorkTeamUnconfigured scope={operating.teamScope} />
      ) : (
        <>
          <WalkListSummaryCards summary={operating.board.summary} />
          <AppCard as="section">
            <OperatingLocationWalkList locations={operating.walkLocations} />
          </AppCard>
        </>
      )}
    </section>
  );
}
