import type { CoverageItem } from "@/lib/todays-work";

import { CoverageListRow } from "./coverage-list-row";

type TodaysWorkCoverageListProps = {
  items: CoverageItem[];
  priorityGap: CoverageItem | null;
};

export function TodaysWorkCoverageList({ items, priorityGap }: TodaysWorkCoverageListProps) {
  const gapItems = items.filter((item) => item.level === "none");
  const thinItems = items.filter((item) => item.level === "thin");
  const coveredItems = items.filter((item) => item.level === "covered");
  const primaryGap = priorityGap && priorityGap.level !== "covered" ? priorityGap : null;
  const remainingGaps = gapItems.filter((item) => item.unitId !== primaryGap?.unitId);
  const remainingThin = thinItems.filter((item) => item.unitId !== primaryGap?.unitId);

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">No active locations configured.</p>;
  }

  return (
    <div className="space-y-6" data-testid="todays-work-coverage-list">
      {primaryGap ? (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Resolve first</p>
          <ul>
            <CoverageListRow item={primaryGap} emphasized />
          </ul>
        </section>
      ) : (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-900">All locations have coverage scheduled</p>
          <p className="mt-1 text-sm text-emerald-800">Use the covered list below for routine verification.</p>
        </section>
      )}

      {remainingGaps.length > 0 ? (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Other gaps</p>
          <ul className="divide-y divide-zinc-100 rounded-xl border border-red-200 bg-white px-4">
            {remainingGaps.map((item) => (
              <CoverageListRow key={item.unitId} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      {remainingThin.length > 0 ? (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Thin coverage</p>
          <ul className="divide-y divide-zinc-100 rounded-xl border border-amber-200 bg-white px-4">
            {remainingThin.map((item) => (
              <CoverageListRow key={item.unitId} item={item} />
            ))}
          </ul>
        </section>
      ) : null}

      {coveredItems.length > 0 ? (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Covered locations</p>
          <ul className="divide-y divide-zinc-100 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4">
            {coveredItems.map((item) => (
              <CoverageListRow key={item.unitId} item={item} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
