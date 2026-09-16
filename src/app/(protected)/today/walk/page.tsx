import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { AppCard } from "@/components/design-system/AppCard";
import { PageHeader } from "@/components/design-system/page-header";
import { TodaysWorkProjectionUnavailable } from "@/components/todays-work/todays-work-experience-contributions";
import { OperatingLocationWalkList } from "@/components/todays-work/operating-location-board";
import { TodaysWorkRunOperationBanner } from "@/components/todays-work/todays-work-run-operation-banner";
import { TodaysWorkScopeLabel, TodaysWorkTeamUnconfigured } from "@/components/todays-work/todays-work-scope";
import { WalkListSummaryCards } from "@/components/todays-work/walk-list-summary";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { isProjectionTodaysWorkEnabled } from "@/lib/feature-flags";
import { loadDepartmentRunPresentation } from "@/lib/operational-cycles";
import { createProjectionRuntimeRequestScope } from "@/lib/projection";
import {
  assembleProjectedTodaysWorkWalk,
  isTeamUnconfiguredScope,
  keyTimeSpaceFilterFromTeamScope,
  loadOperatingLocationBoard,
} from "@/lib/todays-work";

export default async function TodaysWorkWalkPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect("/dashboard");
  }

  const deptNav = await resolveActiveDepartmentForShell(session, await cookies());
  const activeDepartmentKey = deptNav.activeOperationalDepartmentKey;

  if (isProjectionTodaysWorkEnabled()) {
    const assembled = await assembleProjectedTodaysWorkWalk(session, {
      memo: createProjectionRuntimeRequestScope(),
      activeDepartmentKey,
      activeDepartmentId: deptNav.activeDepartmentId,
    });
    if (!assembled.enabled) {
      return (
        <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-walk-page">
          <PageHeader icon="todaysWork" eyebrow="Today's Work" title="Walk list" />
          <TodaysWorkProjectionUnavailable message="Walk list Projection unavailable." />
        </section>
      );
    }
    if ("error" in assembled && assembled.error && !("board" in assembled)) {
      return (
        <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-walk-page">
          <PageHeader icon="todaysWork" eyebrow="Today's Work" title="Walk list" />
          <TodaysWorkProjectionUnavailable message={assembled.error} />
        </section>
      );
    }
    if (!("board" in assembled) || !assembled.board) {
      return (
        <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-walk-page">
          <PageHeader icon="todaysWork" eyebrow="Today's Work" title="Walk list" />
          <TodaysWorkProjectionUnavailable message="Walk list Projection unavailable." />
        </section>
      );
    }

    const runPresentation = deptNav.activeDepartmentId
      ? await loadDepartmentRunPresentation({
          session,
          facilityId: session.facilityId,
          departmentId: deptNav.activeDepartmentId,
          spaceIdFilter: keyTimeSpaceFilterFromTeamScope(assembled.teamScope),
        })
      : null;
    const operationBanner =
      runPresentation?.provenance === "NEW_PERIOD_KEY_TIME" ? (
        <TodaysWorkRunOperationBanner presentation={runPresentation} />
      ) : null;
    const teamUnconfigured = isTeamUnconfiguredScope(assembled.teamScope);

    return (
      <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-walk-page">
        <PageHeader
          icon="todaysWork"
          eyebrow="Today's Work"
          title="Walk list"
          subtitle="If you are making rounds, where should you go first?"
          actions={
            <Link
              href="/today"
              className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
            >
              Back to hub
            </Link>
          }
          below={
            <>
              <TodaysWorkScopeLabel
                scope={assembled.teamScope}
                locationCount={assembled.board.locations.length}
              />
              {teamUnconfigured ? null : operationBanner}
            </>
          }
        />
        {teamUnconfigured && assembled.teamScope ? (
          <TodaysWorkTeamUnconfigured scope={assembled.teamScope} />
        ) : (
          <>
            <WalkListSummaryCards summary={assembled.board.summary} />
            <AppCard as="section">
              <OperatingLocationWalkList locations={assembled.board.locations} />
            </AppCard>
          </>
        )}
      </section>
    );
  }

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
  const operationBanner =
    runPresentation?.provenance === "NEW_PERIOD_KEY_TIME" ? (
      <TodaysWorkRunOperationBanner presentation={runPresentation} />
    ) : (
      <OperationContextBanner context={operating.operationContext} embedded />
    );
  const teamUnconfigured = isTeamUnconfiguredScope(operating.teamScope);

  return (
    <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-walk-page">
      <PageHeader
        icon="todaysWork"
        eyebrow="Today's Work"
        title="Walk list"
        subtitle="If you are making rounds, where should you go first?"
        actions={
          <Link
            href="/today"
            className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
          >
            Back to hub
          </Link>
        }
        below={
          <>
            <TodaysWorkScopeLabel
              scope={operating.teamScope}
              locationCount={operating.walkLocations.length}
            />
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
