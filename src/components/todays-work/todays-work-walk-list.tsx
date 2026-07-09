import { AppCard } from "@/components/design-system/AppCard";
import { EmptyState } from "@/components/design-system/EmptyState";
import { SectionHeader } from "@/components/design-system/SectionHeader";
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
          <SectionHeader eyebrow="Look here first" className="mb-3" />
          <ul>
            <WalkListRow item={primaryItem} rank={1} emphasized />
          </ul>
        </section>
      ) : (
        <EmptyState
          icon="ready"
          title="All locations look ready"
          description="Use the healthy list below for routine verification."
          tone="success"
        />
      )}

      {remainingAttention.length > 0 ? (
        <section>
          <SectionHeader eyebrow="Remaining route" className="mb-3" />
          <AppCard as="div" className="px-4 py-0 shadow-none sm:px-4 sm:py-0">
            <ul className="divide-y divide-zinc-100">
              {remainingAttention.map((item, index) => (
                <WalkListRow key={item.unitId} item={item} rank={index + 2} />
              ))}
            </ul>
          </AppCard>
        </section>
      ) : null}

      {showHealthySection && healthyItems.length > 0 ? (
        <section>
          <SectionHeader eyebrow="Healthy locations" muted className="mb-3" />
          <AppCard as="div" className="border-dashed bg-zinc-50/80 px-4 py-0 shadow-none sm:px-4 sm:py-0">
            <ul className="divide-y divide-zinc-100">
              {healthyItems.map((item, index) => (
                <WalkListRow
                  key={item.unitId}
                  item={item}
                  rank={attentionItems.length > 0 ? attentionItems.length + index + 1 : index + 1}
                />
              ))}
            </ul>
          </AppCard>
        </section>
      ) : null}
    </div>
  );
}
