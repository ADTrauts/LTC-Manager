import Link from "next/link";

import { AppCard } from "@/components/design-system/AppCard";
import { SectionHeader } from "@/components/design-system/SectionHeader";
import type { WalkListItem } from "@/lib/todays-work";

import { WalkListRow } from "./walk-list-row";

type TodaysWorkWalkPreviewProps = {
  items: WalkListItem[];
  lookFirst: WalkListItem | null;
};

export function TodaysWorkWalkPreview({ items, lookFirst }: TodaysWorkWalkPreviewProps) {
  const preview = items.slice(0, 8);

  return (
    <AppCard as="section" data-testid="today-walk-preview">
      <SectionHeader
        eyebrow="Walk list preview"
        title="Where should I look first?"
        description="Risk-ordered locations using today's logs, staffing, and open repairs."
        actions={
          <Link
            href="/today/walk"
            className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
          >
            Open full walk list
          </Link>
        }
      />

      {preview.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No active locations configured.</p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100">
          {preview.map((item, index) => (
            <WalkListRow key={item.unitId} item={item} rank={index + 1} />
          ))}
        </ul>
      )}

      {items.length > preview.length ? (
        <p className="mt-3 text-sm text-zinc-600">
          <Link href="/today/walk" className="font-medium text-zinc-900 underline hover:text-zinc-700">
            View all {items.length} locations
          </Link>
          {lookFirst && lookFirst.status !== "ready" ? ` — start at ${lookFirst.unitName}` : ""}
        </p>
      ) : null}
    </AppCard>
  );
}
