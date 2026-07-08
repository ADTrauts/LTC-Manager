import type { WalkListSummary } from "@/lib/todays-work";

type WalkListSummaryCardsProps = {
  summary: WalkListSummary;
};

export function WalkListSummaryCards({ summary }: WalkListSummaryCardsProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-3" data-testid="walk-list-summary">
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-700">Blocked</p>
        <p className="mt-2 text-3xl font-semibold text-red-900">{summary.blocked}</p>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">In progress</p>
        <p className="mt-2 text-3xl font-semibold text-amber-950">{summary.inProgress}</p>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Ready</p>
        <p className="mt-2 text-3xl font-semibold text-emerald-950">{summary.ready}</p>
      </div>
    </section>
  );
}
