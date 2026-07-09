import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { OperationContextBanner } from "@/components/operations-center/operation-context-banner";
import { TodaysWorkWalkPreview } from "@/components/todays-work/todays-work-walk-preview";
import { WalkListSummaryCards } from "@/components/todays-work/walk-list-summary";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { loadWalkList } from "@/lib/todays-work";

export default async function TodaysWorkHubPage() {
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
    <section className="mx-auto max-w-5xl space-y-6" data-testid="todays-work-hub">
      <header className="space-y-3 border-b border-zinc-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Today&apos;s Work</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Supervisor hub</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Start with the highest-risk locations for the current meal period. Handoffs and call-downs arrive in later
            Wave 4 milestones.
          </p>
        </div>
        <OperationContextBanner context={operationContext} />
      </header>

      <WalkListSummaryCards summary={summary} />

      {lookFirst && lookFirst.status !== "ready" ? (
        <section className="rounded-xl border-2 border-zinc-900 bg-zinc-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Look here first</p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-900">{lookFirst.unitName}</h2>
          <p className="mt-1 text-sm text-zinc-700">{lookFirst.reason}</p>
          <div className="mt-4 flex flex-wrap gap-2">
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
        </section>
      ) : (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-900">No blocked locations right now</p>
          <p className="mt-1 text-sm text-emerald-800">
            Walk preview still lists active locations if you want a routine pass.
          </p>
        </section>
      )}

      <TodaysWorkWalkPreview items={items} lookFirst={lookFirst} />

      <section className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Related</p>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <Link href="/today/walk" className="font-medium text-zinc-800 underline hover:text-zinc-600">
            Full walk list
          </Link>
          <Link href="/today/coverage" className="font-medium text-zinc-800 underline hover:text-zinc-600">
            Coverage
          </Link>
          <Link href="/dashboard" className="font-medium text-zinc-800 underline hover:text-zinc-600">
            Operations Center
          </Link>
          <Link href="/staffing" className="font-medium text-zinc-800 underline hover:text-zinc-600">
            Staffing
          </Link>
        </div>
      </section>
    </section>
  );
}
