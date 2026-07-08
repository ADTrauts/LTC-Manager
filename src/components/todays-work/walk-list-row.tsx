import Link from "next/link";

import type { WalkListItem } from "@/lib/todays-work";

import { WalkListSignals } from "./walk-list-signals";
import { WalkListStatusBadge } from "./walk-list-status";

type WalkListRowProps = {
  item: WalkListItem;
  rank: number;
  emphasized?: boolean;
};

export function WalkListRow({ item, rank, emphasized = false }: WalkListRowProps) {
  const unitTypeLabel = item.unitType.charAt(0) + item.unitType.slice(1).toLowerCase().replace(/_/g, " ");

  return (
    <li>
      <Link
        href={item.href}
        className={`flex flex-wrap items-start gap-3 touch-manipulation hover:bg-zinc-50 ${
          emphasized ? "rounded-xl border-2 border-zinc-900 bg-zinc-50 p-4 shadow-sm" : "py-3"
        }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            emphasized ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`font-semibold text-zinc-900 ${emphasized ? "text-lg" : ""}`}>{item.unitName}</p>
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{unitTypeLabel}</span>
          </div>
          <p className="mt-0.5 text-sm text-zinc-600">{item.reason}</p>
          <WalkListSignals item={item} />
        </div>
        <WalkListStatusBadge status={item.status} />
      </Link>
    </li>
  );
}
