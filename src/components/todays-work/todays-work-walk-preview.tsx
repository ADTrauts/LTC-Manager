import Link from "next/link";

import type { WalkListItem } from "@/lib/todays-work";

import { WalkListRow } from "./walk-list-row";

type TodaysWorkWalkPreviewProps = {
  items: WalkListItem[];
  lookFirst: WalkListItem | null;
};

export function TodaysWorkWalkPreview({ items, lookFirst }: TodaysWorkWalkPreviewProps) {
  const preview = items.slice(0, 8);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="today-walk-preview">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Walk list preview</p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-900">Where should I look first?</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Risk-ordered locations using today&apos;s logs, staffing, and open repairs.
          </p>
        </div>
        <Link
          href="/today/walk"
          className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
        >
          Open full walk list
        </Link>
      </div>

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
    </section>
  );
}
