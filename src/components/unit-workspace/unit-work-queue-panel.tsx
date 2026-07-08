import Link from "next/link";

import type { UnitWorkQueue, UnitWorkQueueItem } from "@/lib/unit-workspace/build-unit-work-queue";

type UnitWorkQueuePanelProps = {
  queue: UnitWorkQueue;
};

function queueItemClass(item: UnitWorkQueueItem, isPrimary: boolean) {
  if (isPrimary) {
    return "rounded-xl border-2 border-zinc-900 bg-zinc-50 p-4 shadow-sm";
  }
  return "rounded-xl border border-zinc-200 bg-white p-3.5";
}

function QueueItemRow({ item, isPrimary }: { item: UnitWorkQueueItem; isPrimary: boolean }) {
  const content = (
    <>
      <p className={`font-semibold text-zinc-900 ${isPrimary ? "text-base sm:text-lg" : "text-sm sm:text-base"}`}>
        {item.title}
      </p>
      <p className="mt-1 text-sm text-zinc-600">{item.detail}</p>
      {item.href ? (
        <p className="mt-3 inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white">
          {isPrimary ? "Start now" : "Open"}
        </p>
      ) : (
        <p className="mt-2 text-xs font-medium text-zinc-500">Use meal controls above</p>
      )}
    </>
  );

  return (
    <li className={queueItemClass(item, isPrimary)}>
      {item.href ? (
        <Link href={item.href} className="block touch-manipulation active:opacity-90">
          {content}
        </Link>
      ) : (
        content
      )}
    </li>
  );
}

export function UnitWorkQueuePanel({ queue }: UnitWorkQueuePanelProps) {
  const operational = queue.items.filter((item) => item.priority < 600);

  return (
    <section
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
      aria-labelledby="unit-next-work-heading"
      data-testid="unit-work-queue"
    >
      <p id="unit-next-work-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Next work
      </p>
      {queue.operationalCount === 0 ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
          <p className="font-semibold text-emerald-900">All caught up for this meal period</p>
          <p className="mt-1 text-sm text-emerald-800">
            No failed logs, pending submissions, servery milestones, or open repairs need attention right now.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
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
              <ul className="space-y-2.5">
                {operational.slice(1).map((item) => (
                  <QueueItemRow key={item.id} item={item} isPrimary={false} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
