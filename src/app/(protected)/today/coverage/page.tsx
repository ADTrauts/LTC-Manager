import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { CoverageSummaryCards } from "@/components/todays-work/coverage-list-summary";
import { TodaysWorkCoverageList } from "@/components/todays-work/todays-work-coverage-list";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { loadCoverageList } from "@/lib/todays-work";

export default async function TodaysWorkCoveragePage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect("/dashboard");
  }

  const coverage = await loadCoverageList(session.facilityId);
  const { summary, operationContext, items, priorityGap, dateIso } = coverage;

  return (
    <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-coverage-page">
      <header className="space-y-3 border-b border-zinc-200 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Today&apos;s Work</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Coverage</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600">
              See where staffing gaps are today and jump into the staffing grid to resolve them.
            </p>
          </div>
          <Link
            href="/today"
            className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
          >
            Back to hub
          </Link>
        </div>
        <OperationContextBanner context={operationContext} />
      </header>

      <CoverageSummaryCards summary={summary} />

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Staffing grid</p>
          <p className="mt-1 text-sm text-zinc-600">Assign employees by location for {dateIso}.</p>
        </div>
        <Link
          href={`/staffing?date=${dateIso}`}
          className="inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white touch-manipulation hover:bg-zinc-700"
        >
          Open staffing
        </Link>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <TodaysWorkCoverageList items={items} priorityGap={priorityGap} />
      </section>
    </section>
  );
}
