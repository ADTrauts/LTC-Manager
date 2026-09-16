import { formatClock12 } from "@/lib/operational-cycles";
import type { OperationsCenterKeyTimeSummary } from "@/lib/operations-center/types";

type Props = {
  summaries: readonly OperationsCenterKeyTimeSummary[];
};

export function OperationsCenterKeyTimeSummaries({ summaries }: Props) {
  if (summaries.length === 0) return null;

  return (
    <section
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
      data-testid="operations-center-key-times"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Key Times</p>
      <ul className="mt-2 space-y-2">
        {summaries.map((group) => (
          <li
            key={`${group.displayPath}-${group.expectedToday}`}
            className="text-sm text-zinc-800"
          >
            <p className="font-medium text-zinc-900">
              {group.parentCycleLabel
                ? `${group.parentCycleLabel} → ${group.cycleLabel}`
                : group.cycleLabel}
            </p>
            <p className="text-xs text-zinc-600">
              {formatClock12(group.expectedToday) ?? group.expectedToday} · {group.completed} /{" "}
              {group.total} complete
              {group.overdue > 0 ? ` · ${group.overdue} overdue` : ""}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
