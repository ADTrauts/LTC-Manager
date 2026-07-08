import type { WalkListItem } from "@/lib/todays-work";

import { WalkListRow } from "./walk-list-row";

type TodaysWorkWalkListProps = {
  items: WalkListItem[];
  lookFirst: WalkListItem | null;
  showHealthySection?: boolean;
};

export function TodaysWorkWalkList({
  items,
  lookFirst,
  showHealthySection = true,
}: TodaysWorkWalkListProps) {
  const attentionItems = items.filter((item) => item.status !== "ready");
  const healthyItems = items.filter((item) => item.status === "ready");
  const primaryItem = lookFirst && lookFirst.status !== "ready" ? lookFirst : attentionItems[0] ?? null;
  const remainingAttention = attentionItems.filter((item) => item.unitId !== primaryItem?.unitId);

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">No active locations configured.</p>;
  }

  return (
    <div className="space-y-6" data-testid="todays-work-walk-list">
      {primaryItem ? (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Look here first</p>
          <ul>
            <WalkListRow item={primaryItem} rank={1} emphasized />
          </ul>
        </section>
      ) : (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-900">All locations look ready</p>
          <p className="mt-1 text-sm text-emerald-800">Use the healthy list below for routine verification.</p>
        </section>
      )}

      {remainingAttention.length > 0 ? (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Remaining route</p>
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white px-4">
            {remainingAttention.map((item, index) => (
              <WalkListRow key={item.unitId} item={item} rank={index + 2} />
            ))}
          </ul>
        </section>
      ) : null}

      {showHealthySection && healthyItems.length > 0 ? (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Healthy locations</p>
          <ul className="divide-y divide-zinc-100 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4">
            {healthyItems.map((item, index) => (
              <WalkListRow
                key={item.unitId}
                item={item}
                rank={attentionItems.length > 0 ? attentionItems.length + index + 1 : index + 1}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
