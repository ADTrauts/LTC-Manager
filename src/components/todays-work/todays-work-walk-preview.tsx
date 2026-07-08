import Link from "next/link";

import type { WalkListItem, WalkListStatus } from "@/lib/todays-work";

type TodaysWorkWalkPreviewProps = {
  items: WalkListItem[];
  lookFirst: WalkListItem | null;
};

function statusLabel(status: WalkListStatus): string {
  if (status === "blocked") return "Blocked";
  if (status === "in_progress") return "In progress";
  return "Ready";
}

function statusClass(status: WalkListStatus): string {
  if (status === "blocked") return "border-red-200 bg-red-50 text-red-800";
  if (status === "in_progress") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

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
        {lookFirst ? (
          <Link
            href={lookFirst.href}
            className="inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white touch-manipulation hover:bg-zinc-700"
          >
            Open {lookFirst.unitName}
          </Link>
        ) : null}
      </div>

      {preview.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No active locations configured.</p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-100">
          {preview.map((item, index) => (
            <li key={item.unitId}>
              <Link
                href={item.href}
                className="flex flex-wrap items-center gap-3 py-3 touch-manipulation hover:bg-zinc-50"
              >
                <span className="w-6 shrink-0 text-sm font-semibold text-zinc-400">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-zinc-900">{item.unitName}</p>
                  <p className="text-sm text-zinc-600">{item.reason}</p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}
                >
                  {statusLabel(item.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length > preview.length ? (
        <p className="mt-2 text-xs text-zinc-500">
          Showing top {preview.length} of {items.length}. Full walk route ships next.
        </p>
      ) : null}
    </section>
  );
}
