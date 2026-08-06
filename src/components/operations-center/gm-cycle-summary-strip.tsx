import Link from "next/link";

import { isDietaryJobFlowEnabled } from "@/lib/feature-flags";
import type { GmCycleSummary } from "@/lib/operational-cycles";

type Props = {
  summary: GmCycleSummary;
};

/**
 * Compact non-card Dietary cycle strip for Operations Center / dashboard.
 * Does not redesign the dashboard layout.
 */
export function GmCycleSummaryStrip({ summary }: Props) {
  const { currentLabel, nextLabel, readiness } = summary;
  const cycleText = [
    currentLabel ? `Now: ${currentLabel}` : null,
    nextLabel ? `Next: ${nextLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const jobFlowEnabled = isDietaryJobFlowEnabled();

  return (
    <div
      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 pb-3 text-sm text-zinc-700"
      data-testid="gm-cycle-summary"
    >
      <p>
        <span className="font-medium text-zinc-900">Dietary cycles</span>
        {cycleText ? (
          <span className="ml-2">{cycleText}</span>
        ) : (
          <span className="ml-2 text-zinc-500">No published cycle active</span>
        )}
        <span className="ml-2 text-xs text-zinc-500">
          Ready {readiness.readyConfirmed} · Not confirmed {readiness.notConfirmed}
          {readiness.late > 0 ? ` · Late ${readiness.late}` : ""}
          {readiness.missingConfig > 0
            ? ` · Missing config ${readiness.missingConfig}`
            : ""}
        </span>
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/staffing/cycles"
          className="text-xs font-medium text-zinc-800 underline-offset-2 hover:underline"
        >
          Cycle overview
        </Link>
        {jobFlowEnabled ? (
          <Link
            href="/staffing/operations"
            className="text-xs font-medium text-zinc-800 underline-offset-2 hover:underline"
          >
            Operations Board
          </Link>
        ) : null}
      </div>
    </div>
  );
}
