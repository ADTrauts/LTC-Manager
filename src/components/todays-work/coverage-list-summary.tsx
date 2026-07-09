import { MetricCard } from "@/components/design-system/MetricCard";
import type { CoverageSummary } from "@/lib/todays-work";

type CoverageSummaryCardsProps = {
  summary: CoverageSummary;
};

export function CoverageSummaryCards({ summary }: CoverageSummaryCardsProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-3" data-testid="coverage-summary">
      <MetricCard label="Gaps" value={summary.gaps} hint="No staff scheduled" tone="blocked" />
      <MetricCard label="Thin" value={summary.thin} hint="Partial meal coverage" tone="in_progress" />
      <MetricCard label="Covered" value={summary.covered} hint="Staff scheduled today" tone="ready" />
    </section>
  );
}
