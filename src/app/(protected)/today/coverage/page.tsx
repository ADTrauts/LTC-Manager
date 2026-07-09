import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { AppCard } from "@/components/design-system/AppCard";
import { PageHeader } from "@/components/design-system/page-header";
import { CoverageSummaryCards } from "@/components/todays-work/coverage-list-summary";
import { TodaysWorkCallDownList } from "@/components/todays-work/todays-work-call-down-list";
import { TodaysWorkCoverageList } from "@/components/todays-work/todays-work-coverage-list";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { loadCallDownList, loadCoverageList } from "@/lib/todays-work";

export default async function TodaysWorkCoveragePage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect("/dashboard");
  }

  const [coverage, callDowns] = await Promise.all([
    loadCoverageList(session.facilityId),
    loadCallDownList(session.facilityId),
  ]);
  const { summary, operationContext, items, priorityGap, dateIso } = coverage;

  return (
    <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-coverage-page">
      <PageHeader
        icon="todaysWork"
        eyebrow="Today's Work"
        title="Coverage"
        subtitle="See where staffing gaps are today and jump into the staffing grid to resolve them."
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

      <CoverageSummaryCards summary={summary} />

      <AppCard
        as="section"
        title="Staffing grid"
        subtitle={`Assign employees by location for ${dateIso}.`}
        actions={
          <Link
            href={`/staffing?date=${dateIso}`}
            className="inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white touch-manipulation hover:bg-zinc-700"
          >
            Open staffing
          </Link>
        }
      />

      <TodaysWorkCallDownList items={callDowns.items} compact />

      <AppCard as="section">
        <TodaysWorkCoverageList items={items} priorityGap={priorityGap} />
      </AppCard>
    </section>
  );
}
