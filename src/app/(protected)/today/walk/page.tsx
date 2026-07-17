import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { AppCard } from "@/components/design-system/AppCard";
import { PageHeader } from "@/components/design-system/page-header";
import { TodaysWorkProjectionUnavailable } from "@/components/todays-work/todays-work-experience-contributions";
import { TodaysWorkWalkList } from "@/components/todays-work/todays-work-walk-list";
import { WalkListSummaryCards } from "@/components/todays-work/walk-list-summary";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { isProjectionTodaysWorkEnabled } from "@/lib/feature-flags";
import { createProjectionRuntimeRequestScope } from "@/lib/projection";
import { assembleProjectedTodaysWorkWalk, loadWalkList } from "@/lib/todays-work";

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
    });
    if (!assembled.enabled) {
      return (
        <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-walk-page">
          <PageHeader icon="todaysWork" eyebrow="Today's Work" title="Walk list" />
          <TodaysWorkProjectionUnavailable message="Walk list Projection unavailable." />
        </section>
      );
    }
    if ("error" in assembled && assembled.error && !("walk" in assembled)) {
      return (
        <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-walk-page">
          <PageHeader icon="todaysWork" eyebrow="Today's Work" title="Walk list" />
          <TodaysWorkProjectionUnavailable message={assembled.error} />
        </section>
      );
    }
    if (!("walk" in assembled) || !assembled.walk) {
      return (
        <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-walk-page">
          <PageHeader icon="todaysWork" eyebrow="Today's Work" title="Walk list" />
          <TodaysWorkProjectionUnavailable message="Walk list Projection unavailable." />
        </section>
      );
    }

    const { summary, operationContext, items, lookFirst } = assembled.walk;
    return (
      <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-walk-page">
        <PageHeader
          icon="todaysWork"
          eyebrow="Today's Work"
          title="Walk list"
          subtitle="Visit projected locations in risk order. Tap a row to open the unit workspace — nothing is edited here."
          actions={
            <Link
              href="/today"
              className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
            >
              Back to hub
            </Link>
          }
          below={<OperationContextBanner context={operationContext} embedded />}
        />
        <WalkListSummaryCards summary={summary} />
        <AppCard as="section">
          <TodaysWorkWalkList items={items} lookFirst={lookFirst} />
        </AppCard>
      </section>
    );
  }

  const walkList = await loadWalkList(session.facilityId, { activeDepartmentKey });
  const { summary, operationContext, items, lookFirst } = walkList;

  return (
    <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-walk-page">
      <PageHeader
        icon="todaysWork"
        eyebrow="Today's Work"
        title="Walk list"
        subtitle="Visit projected locations in risk order. Tap a row to open the unit workspace — nothing is edited here."
        actions={
          <Link
            href="/today"
            className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
          >
            Back to hub
          </Link>
        }
        below={<OperationContextBanner context={operationContext} embedded />}
      />

      <WalkListSummaryCards summary={summary} />

      <AppCard as="section">
        <TodaysWorkWalkList items={items} lookFirst={lookFirst} />
      </AppCard>
    </section>
  );
}
