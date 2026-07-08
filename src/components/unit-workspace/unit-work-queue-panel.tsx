import Link from "next/link";

import type { UnitWorkQueue, UnitWorkQueueItem } from "@/lib/unit-workspace/build-unit-work-queue";

type UnitWorkQueuePanelProps = {
  queue: UnitWorkQueue;
};

function queueItemClass(item: UnitWorkQueueItem, isPrimary: boolean) {
  if (isPrimary) {
    return "rounded-lg border-2 border-zinc-900 bg-zinc-50 p-4 shadow-sm";
  }
  if (item.kind === "secondary") {
    return "rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 p-3";
  }
  return "rounded-lg border border-zinc-200 bg-white p-3";
}

function QueueItemRow({ item, isPrimary }: { item: UnitWorkQueueItem; isPrimary: boolean }) {
  const content = (
    <>
      <p className={`font-medium text-zinc-900 ${isPrimary ? "text-base" : "text-sm"}`}>{item.title}</p>
      <p className="mt-0.5 text-sm text-zinc-600">{item.detail}</p>
    </>
  );

  return (
    <li className={queueItemClass(item, isPrimary)}>
      {item.href ? (
        <Link href={item.href} className="block hover:opacity-90">
          {content}
          <p className="mt-2 text-xs font-medium text-zinc-700 underline">Open</p>
        </Link>
      ) : (
        content
      )}
    </li>
  );
}

export function UnitWorkQueuePanel({ queue }: UnitWorkQueuePanelProps) {
  const operational = queue.items.filter((item) => item.priority < 600);
  const secondary = queue.items.filter((item) => item.priority >= 600);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Next work</p>
      {queue.operationalCount === 0 ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="font-medium text-emerald-900">All caught up for this meal period</p>
          <p className="mt-1 text-sm text-emerald-800">
            No failed logs, pending submissions, servery milestones, or open repairs need attention right now.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {queue.primaryItem ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Do this next</p>
              <ul>
                <QueueItemRow item={queue.primaryItem} isPrimary />
              </ul>
            </div>
          ) : null}
          {operational.length > 1 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Remaining queue</p>
              <ul className="space-y-2">
                {operational.slice(1).map((item) => (
                  <QueueItemRow key={item.id} item={item} isPrimary={false} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
      {secondary.length > 0 ? (
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">History &amp; reference</p>
          <ul className="space-y-2">
            {secondary.map((item) => (
              <QueueItemRow key={item.id} item={item} isPrimary={false} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
