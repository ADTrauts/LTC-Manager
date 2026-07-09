import type { CoverageSummary } from "@/lib/todays-work";

type CoverageSummaryCardsProps = {
  summary: CoverageSummary;
};

export function CoverageSummaryCards({ summary }: CoverageSummaryCardsProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-3" data-testid="coverage-summary">
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-700">Gaps</p>
        <p className="mt-2 text-3xl font-semibold text-red-900">{summary.gaps}</p>
        <p className="mt-1 text-xs text-red-800">No staff scheduled</p>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Thin</p>
        <p className="mt-2 text-3xl font-semibold text-amber-950">{summary.thin}</p>
        <p className="mt-1 text-xs text-amber-900">Partial meal coverage</p>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Covered</p>
        <p className="mt-2 text-3xl font-semibold text-emerald-950">{summary.covered}</p>
        <p className="mt-1 text-xs text-emerald-900">Staff scheduled today</p>
      </div>
    </section>
  );
}
