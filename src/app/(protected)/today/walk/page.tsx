import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { TodaysWorkWalkList } from "@/components/todays-work/todays-work-walk-list";
import { WalkListSummaryCards } from "@/components/todays-work/walk-list-summary";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { loadWalkList } from "@/lib/todays-work";

export default async function TodaysWorkWalkPage() {
  noStore();

  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    redirect("/dashboard");
  }

  const walkList = await loadWalkList(session.facilityId);
  const { summary, operationContext, items, lookFirst } = walkList;

  return (
    <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-walk-page">
      <header className="space-y-3 border-b border-zinc-200 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Today&apos;s Work</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Walk list</h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600">
              Visit locations in risk order. Tap a row to open the unit workspace — nothing is edited here.
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

      <WalkListSummaryCards summary={summary} />

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <TodaysWorkWalkList items={items} lookFirst={lookFirst} />
      </section>
    </section>
  );
}
