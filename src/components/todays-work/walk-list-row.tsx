import { OperationalListRow } from "@/components/design-system/OperationalListRow";
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
    <OperationalListRow
      emphasized={emphasized}
      href={item.href}
      rank={rank}
      title={item.unitName}
      meta={<span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{unitTypeLabel}</span>}
      description={item.reason}
      details={<WalkListSignals item={item} />}
      status={<WalkListStatusBadge status={item.status} />}
    />
  );
}
