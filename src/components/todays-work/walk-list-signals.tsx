import type { WalkListItem } from "@/lib/todays-work";

type WalkListSignalsProps = {
  item: WalkListItem;
};

export function WalkListSignals({ item }: WalkListSignalsProps) {
  const signals = [
    item.failed > 0 ? `${item.failed} failed` : null,
    item.missed > 0 ? `${item.missed} missed` : null,
    item.pending > 0 ? `${item.pending} due` : null,
    item.openRepairCount > 0 ? `${item.openRepairCount} repair${item.openRepairCount === 1 ? "" : "s"}` : null,
    item.staffingCount === 0 ? "no staff" : `${item.staffingCount} staffed`,
  ].filter(Boolean);

  return (
    <p className="mt-1 text-xs text-zinc-500">
      {signals.join(" · ")}
    </p>
  );
}
