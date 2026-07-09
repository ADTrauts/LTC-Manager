import { EmptyState } from "@/components/design-system/EmptyState";
import {
  operationalListShellClass,
  operationalListShellMutedClass,
} from "@/components/design-system/OperationalListRow";
import { SectionHeader } from "@/components/design-system/SectionHeader";
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
    <div className="space-y-5 sm:space-y-6" data-testid="todays-work-coverage-list">
      {primaryGap ? (
        <section>
          <SectionHeader eyebrow="Resolve first" className="mb-3" />
          <ul>
            <CoverageListRow item={primaryGap} emphasized />
          </ul>
        </section>
      ) : (
        <EmptyState
          icon="ready"
          title="All locations have coverage scheduled"
          description="Use the covered list below for routine verification."
          tone="success"
          inset
        />
      )}

      {remainingGaps.length > 0 ? (
        <section>
          <SectionHeader eyebrow="Other gaps" className="mb-3" />
          <div className={`${operationalListShellClass} border-red-200`}>
            <ul className="divide-y divide-zinc-100">
              {remainingGaps.map((item) => (
                <CoverageListRow key={item.unitId} item={item} />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {remainingThin.length > 0 ? (
        <section>
          <SectionHeader eyebrow="Thin coverage" className="mb-3" />
          <div className={`${operationalListShellClass} border-amber-200`}>
            <ul className="divide-y divide-zinc-100">
              {remainingThin.map((item) => (
                <CoverageListRow key={item.unitId} item={item} />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {coveredItems.length > 0 ? (
        <section>
          <SectionHeader eyebrow="Covered locations" muted className="mb-3" />
          <div className={operationalListShellMutedClass}>
            <ul className="divide-y divide-zinc-100">
              {coveredItems.map((item) => (
                <CoverageListRow key={item.unitId} item={item} />
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
