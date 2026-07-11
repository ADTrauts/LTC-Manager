import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { ActionCard } from "@/components/design-system/ActionCard";
import { AppCard } from "@/components/design-system/AppCard";
import { EmptyState } from "@/components/design-system/EmptyState";
import { PageHeader } from "@/components/design-system/page-header";
import { SectionHeader } from "@/components/design-system/SectionHeader";
import { resolveLocationIconKey } from "@/lib/design-system";
import { TodaysWorkCallDownList } from "@/components/todays-work/todays-work-call-down-list";
import { TodaysWorkWalkPreview } from "@/components/todays-work/todays-work-walk-preview";
import { WalkListSummaryCards } from "@/components/todays-work/walk-list-summary";
import { hasAtLeastRole } from "@/lib/access";
import { resolveActiveDepartmentForShell } from "@/lib/active-department-context";
import { getSession } from "@/lib/auth";
import { loadCallDownList, loadWalkList } from "@/lib/todays-work";

export default async function TodaysWorkHubPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect("/dashboard");
  }

  const deptNav = await resolveActiveDepartmentForShell(session, await cookies());
  const [walkList, callDowns] = await Promise.all([
    loadWalkList(session.facilityId, {
      activeDepartmentKey: deptNav.activeOperationalDepartmentKey,
    }),
    loadCallDownList(session.facilityId),
  ]);
  const { summary, operationContext, items, lookFirst } = walkList;

  return (
    <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-hub">
      <PageHeader
        icon="todaysWork"
        eyebrow="Today's Work"
        title="Supervisor hub"
        subtitle="Start with the highest-risk locations for the current meal period, then review handoffs before the next operation."
        below={<OperationContextBanner context={operationContext} embedded />}
      />

      <WalkListSummaryCards summary={summary} />

      {lookFirst && lookFirst.status !== "ready" ? (
        <section>
          <SectionHeader eyebrow="Look here first" className="mb-2" />
          <ActionCard
          emphasized
          icon={resolveLocationIconKey({ unitType: lookFirst.unitType, name: lookFirst.unitName })}
          title={lookFirst.unitName}
          description={lookFirst.reason}
          cta={
            <div className="flex flex-wrap gap-2">
              <Link
                href={lookFirst.href}
                className="inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white touch-manipulation hover:bg-zinc-700"
              >
                Open unit workspace
              </Link>
              <Link
                href={`/staffing?unitId=${encodeURIComponent(lookFirst.unitId)}`}
                className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
              >
                Check staffing
              </Link>
            </div>
          }
          />
        </section>
      ) : (
        <EmptyState
          icon="ready"
          title="No locations need attention right now"
          description="Walk preview still lists active locations if you want a routine pass."
          tone="success"
          inset
        />
      )}

      <TodaysWorkWalkPreview items={items} lookFirst={lookFirst} />

      <TodaysWorkCallDownList items={callDowns.items} />

      <AppCard as="section" className="border-dashed bg-zinc-50/80 shadow-none">
        <SectionHeader eyebrow="Related" muted className="mb-2" />
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/today/walk" className="font-medium text-zinc-800 underline hover:text-zinc-600">
            Full walk list
          </Link>
          <Link href="/today/coverage" className="font-medium text-zinc-800 underline hover:text-zinc-600">
            Coverage
          </Link>
          <Link href="/today/handoffs" className="font-medium text-zinc-800 underline hover:text-zinc-600">
            Handoffs
          </Link>
          <Link href="/dashboard" className="font-medium text-zinc-800 underline hover:text-zinc-600">
            Operations Center
          </Link>
          <Link href="/staffing" className="font-medium text-zinc-800 underline hover:text-zinc-600">
            Staffing
          </Link>
        </div>
      </AppCard>
    </section>
  );
}
