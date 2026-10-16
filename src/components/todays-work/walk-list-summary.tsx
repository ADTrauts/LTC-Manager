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
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 [&>div:last-child]:col-span-2 sm:[&>div:last-child]:col-span-1 [&>div]:p-3 sm:[&>div]:p-4" data-testid="walk-list-summary">
      <MetricCard label="Needs Attention" value={values.needsAttention} tone="blocked" icon="blocked" />
      <MetricCard label="In Progress" value={values.inProgress} tone="in_progress" icon="inProgress" />
      <MetricCard label="On Track" value={values.onTrack} tone="ready" icon="ready" />
    </section>
  );
}
