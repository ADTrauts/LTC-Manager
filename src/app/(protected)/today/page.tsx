import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { AppCard } from "@/components/design-system/AppCard";
import { PageHeader } from "@/components/design-system/page-header";
import { SectionHeader } from "@/components/design-system/SectionHeader";
import { TodaysWorkCallDownList } from "@/components/todays-work/todays-work-call-down-list";
import { TodaysWorkProjectionUnavailable } from "@/components/todays-work/todays-work-experience-contributions";
import { OperatingLocationBoard } from "@/components/todays-work/operating-location-board";
import { TodaysWorkRunOperationBanner } from "@/components/todays-work/todays-work-run-operation-banner";
import { TodaysWorkScopeLabel, TodaysWorkTeamUnconfigured } from "@/components/todays-work/todays-work-scope";
import { WalkListSummaryCards } from "@/components/todays-work/walk-list-summary";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { resolveDefaultHomePath } from "@/lib/nav-zones";
import { isProjectionTodaysWorkEnabled } from "@/lib/feature-flags";
import { loadDepartmentRunPresentation } from "@/lib/operational-cycles";
import { createProjectionRuntimeRequestScope } from "@/lib/projection";
import {
  assembleProjectedTodaysWorkHub,
  isTeamUnconfiguredScope,
  keyTimeSpaceFilterFromTeamScope,
  loadPresenceCallOffs,
  loadOperatingLocationBoard,
  TODAYS_WORK_HUB_SUBTITLE,
} from "@/lib/todays-work";

export default async function TodaysWorkHubPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect(
      resolveDefaultHomePath({
        authKind: session.authKind,
        role: session.role,
        activeUnitId: session.activeUnitId,
      }),
    );
  }

  const deptNav = await resolveActiveDepartmentForShell(session, await cookies());
  const activeDepartmentKey = deptNav.activeOperationalDepartmentKey;

  if (isProjectionTodaysWorkEnabled()) {
    const memo = createProjectionRuntimeRequestScope();
    const assembled = await assembleProjectedTodaysWorkHub(session, {
      memo,
      activeDepartmentKey,
      activeDepartmentId: deptNav.activeDepartmentId,
    });

    if ("enabled" in assembled && assembled.enabled === false) {
      return (
        <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-hub">
          <TodaysWorkProjectionUnavailable message="Today's Work Projection is not available." />
        </section>
      );
    }

    if ("error" in assembled && assembled.error && !("walk" in assembled)) {
      return (
        <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-hub">
          <PageHeader
            icon="todaysWork"
            eyebrow="Today's Work"
            title="Supervisor hub"
            subtitle={TODAYS_WORK_HUB_SUBTITLE}
          />
          <TodaysWorkProjectionUnavailable message={assembled.error} />
        </section>
      );
    }

    if (!("board" in assembled)) {
      return (
        <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-hub">
          <TodaysWorkProjectionUnavailable message="Today's Work Projection is not available." />
        </section>
      );
    }

    const { board, callDowns, projection, teamScope } = assembled;
    const runPresentation = deptNav.activeDepartmentId
      ? await loadDepartmentRunPresentation({
          session,
          facilityId: session.facilityId,
          departmentId: deptNav.activeDepartmentId,
          spaceIdFilter: keyTimeSpaceFilterFromTeamScope(teamScope),
        })
      : null;
    const operationBanner =
      runPresentation?.provenance === "NEW_PERIOD_KEY_TIME" ? (
        <TodaysWorkRunOperationBanner presentation={runPresentation} />
      ) : null;
    const teamUnconfigured = isTeamUnconfiguredScope(teamScope);

    return (
      <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-hub">
        <PageHeader
          icon="todaysWork"
          eyebrow="Today's Work"
          title="Supervisor hub"
          subtitle={TODAYS_WORK_HUB_SUBTITLE}
          below={
            <>
              <TodaysWorkScopeLabel scope={teamScope} locationCount={board.locations.length} />
              {teamUnconfigured ? null : operationBanner}
            </>
          }
        />

        {projection.lensMode === "FACILITY" ? (
          <p className="text-sm text-zinc-600">
            All Departments — choose a department for period and Key Time summaries. Operating
            locations below are listed by department.
          </p>
        ) : null}

        {teamUnconfigured && teamScope ? (
          <TodaysWorkTeamUnconfigured scope={teamScope} />
        ) : (
          <>
            <WalkListSummaryCards summary={board.summary} />

            <section>
              <SectionHeader eyebrow="Operating locations" className="mb-3" />
              <OperatingLocationBoard locations={board.locations} />
            </section>
          </>
        )}

        <AppCard as="section" className="border-dashed bg-zinc-50/80 shadow-none">
          <SectionHeader eyebrow="Related" muted className="mb-2" />
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/today/walk" className="font-medium text-zinc-800 underline hover:text-zinc-600">
              Open walk list
            </Link>
            <Link href="/today/coverage" className="font-medium text-zinc-800 underline hover:text-zinc-600">
              Coverage
            </Link>
            <Link href="/today/handoffs" className="font-medium text-zinc-800 underline hover:text-zinc-600">
              Handoffs
            </Link>
          </div>
        </AppCard>

        <TodaysWorkCallDownList items={callDowns.items} />
      </section>
    );
  }

  const [operating, callDowns] = await Promise.all([
    loadOperatingLocationBoard(session.facilityId, {
      session,
      activeDepartmentKey,
      activeDepartmentId: deptNav.activeDepartmentId,
    }),
    loadPresenceCallOffs(session.facilityId),
  ]);
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
    <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-hub">
      <PageHeader
        icon="todaysWork"
        eyebrow="Today's Work"
        title="Supervisor hub"
        subtitle={TODAYS_WORK_HUB_SUBTITLE}
        below={
          <>
            <TodaysWorkScopeLabel
              scope={operating.teamScope}
              locationCount={operating.board.locations.length}
            />
            {teamUnconfigured ? null : operationBanner}
          </>
        }
      />

      {!activeDepartmentKey ? (
        <p className="text-sm text-zinc-600">
          All Departments — choose a department for period and Key Time summaries. Operating
          locations below are listed by department.
        </p>
      ) : null}

      {teamUnconfigured && operating.teamScope ? (
        <TodaysWorkTeamUnconfigured scope={operating.teamScope} />
      ) : (
        <>
          <WalkListSummaryCards summary={operating.board.summary} />

          <section>
            <SectionHeader eyebrow="Operating locations" className="mb-3" />
            <OperatingLocationBoard locations={operating.board.locations} />
          </section>
        </>
      )}

      <AppCard as="section" className="border-dashed bg-zinc-50/80 shadow-none">
        <SectionHeader eyebrow="Related" muted className="mb-2" />
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/today/walk" className="font-medium text-zinc-800 underline hover:text-zinc-600">
            Open walk list
          </Link>
          <Link href="/today/coverage" className="font-medium text-zinc-800 underline hover:text-zinc-600">
            Coverage
          </Link>
          <Link href="/today/handoffs" className="font-medium text-zinc-800 underline hover:text-zinc-600">
            Handoffs
          </Link>
          <Link href="/staffing" className="font-medium text-zinc-800 underline hover:text-zinc-600">
            Staffing
          </Link>
        </div>
      </AppCard>

      <TodaysWorkCallDownList items={callDowns.items} />
    </section>
  );
}
