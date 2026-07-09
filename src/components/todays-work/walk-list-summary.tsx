import { MetricCard } from "@/components/design-system/MetricCard";
import type { WalkListSummary } from "@/lib/todays-work";

type WalkListSummaryCardsProps = {
  summary: WalkListSummary;
};

export function WalkListSummaryCards({ summary }: WalkListSummaryCardsProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-3" data-testid="walk-list-summary">
      <MetricCard label="Blocked" value={summary.blocked} tone="blocked" icon="blocked" />
      <MetricCard label="In progress" value={summary.inProgress} tone="in_progress" icon="inProgress" />
      <MetricCard label="Ready" value={summary.ready} tone="ready" icon="ready" />
    </section>
  );
}
