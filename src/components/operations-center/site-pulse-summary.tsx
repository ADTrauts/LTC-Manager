import { AppCard } from "@/components/design-system/AppCard";
import type { SitePulseSummary } from "@/lib/operations-center/types";

type SitePulseSummaryProps = {
  pulse: SitePulseSummary;
};

const TONE_STYLES: Record<SitePulseSummary["tone"], string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-950",
  at_risk: "border-amber-200 bg-amber-50 text-amber-950",
  blocked: "border-red-200 bg-red-50 text-red-950",
  neutral: "border-zinc-200 bg-zinc-50 text-zinc-900",
};

export function SitePulseSummaryCard({ pulse }: SitePulseSummaryProps) {
  return (
    <AppCard as="section" className={TONE_STYLES[pulse.tone]}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Site pulse</p>
      <h2 className="mt-1 text-lg font-semibold">{pulse.headline}</h2>
      <p className="mt-1 text-sm opacity-90">{pulse.locationSummary}</p>
    </AppCard>
  );
}
