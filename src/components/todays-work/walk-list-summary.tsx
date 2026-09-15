import { MetricCard } from "@/components/design-system/MetricCard";
import type { OperatingLocationBoardSummary } from "@/lib/todays-work/operating-locations";
import type { WalkListSummary } from "@/lib/todays-work";

type WalkListSummaryCardsProps = {
  summary: WalkListSummary | OperatingLocationBoardSummary;
};

function counts(summary: WalkListSummary | OperatingLocationBoardSummary) {
  if ("onTrack" in summary) {
    return {
      needsAttention: summary.needsAttention,
      inProgress: summary.inProgress,
      onTrack: summary.onTrack,
    };
  }
  return {
    needsAttention: summary.blocked,
    inProgress: summary.inProgress,
    onTrack: summary.ready,
  };
}

export function WalkListSummaryCards({ summary }: WalkListSummaryCardsProps) {
  const values = counts(summary);
  return (
    <section className="grid gap-3 sm:grid-cols-3" data-testid="walk-list-summary">
      <MetricCard label="Needs Attention" value={values.needsAttention} tone="blocked" icon="blocked" />
      <MetricCard label="In Progress" value={values.inProgress} tone="in_progress" icon="inProgress" />
      <MetricCard label="On Track" value={values.onTrack} tone="ready" icon="ready" />
    </section>
  );
}
