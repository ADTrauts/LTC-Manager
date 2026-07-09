import Link from "next/link";

import { ActionCard } from "@/components/design-system/ActionCard";
import { AppCard } from "@/components/design-system/AppCard";
import { EmptyState } from "@/components/design-system/EmptyState";
import { SectionHeader } from "@/components/design-system/SectionHeader";
import type { AppIconKey } from "@/lib/design-system/icons";
import type { UnitWorkQueue, UnitWorkQueueItem, UnitWorkQueueKind } from "@/lib/unit-workspace/build-unit-work-queue";

type UnitWorkQueuePanelProps = {
  queue: UnitWorkQueue;
};

function queueItemIcon(kind: UnitWorkQueueKind): AppIconKey {
  switch (kind) {
    case "failed-log":
    case "missed-log":
    case "urgent-repair":
      return "blocked";
    case "pending-log":
    case "high-repair":
      return "warning";
    case "servery-ready":
      return "ready";
    case "servery-started":
      return "success";
    case "repair":
      return "repairs";
    default:
      return "operationalMode";
  }
}

function queueCta(item: UnitWorkQueueItem, isPrimary: boolean) {
  if (!item.href) {
    return <p className="text-xs font-medium text-zinc-500">Use meal controls above</p>;
  }

  return (
    <Link
      href={item.href}
      className="inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white touch-manipulation hover:bg-zinc-700"
    >
      {isPrimary ? "Start now" : "Open"}
    </Link>
  );
}

function RemainingQueueItem({ item }: { item: UnitWorkQueueItem }) {
  return (
    <li>
      <AppCard as="div" className="p-3.5 sm:p-3.5">
        <p className="text-sm font-semibold text-zinc-900 sm:text-base">{item.title}</p>
        <p className="mt-1 text-sm text-zinc-600">{item.detail}</p>
        <div className="mt-3">{queueCta(item, false)}</div>
      </AppCard>
    </li>
  );
}

export function UnitWorkQueuePanel({ queue }: UnitWorkQueuePanelProps) {
  const operational = queue.items.filter((item) => item.priority < 600);

  return (
    <AppCard
      as="section"
      aria-labelledby="unit-next-work-heading"
      data-testid="unit-work-queue"
    >
      <p id="unit-next-work-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Next work
      </p>
      {queue.operationalCount === 0 ? (
        <EmptyState
          className="mt-3"
          icon="ready"
          title="All caught up for this meal period"
          description="No failed logs, pending submissions, servery milestones, or open repairs need attention right now."
          tone="success"
        />
      ) : (
        <div className="mt-3 space-y-4">
          {queue.primaryItem ? (
            <div>
              <SectionHeader eyebrow="Do this next" className="mb-2" />
              <ActionCard
                emphasized
                icon={queueItemIcon(queue.primaryItem.kind)}
                title={queue.primaryItem.title}
                description={queue.primaryItem.detail}
                cta={queueCta(queue.primaryItem, true)}
              />
            </div>
          ) : null}
          {operational.length > 1 ? (
            <div>
              <SectionHeader eyebrow="Remaining queue" className="mb-2" />
              <ul className="space-y-2.5">
                {operational.slice(1).map((item) => (
                  <RemainingQueueItem key={item.id} item={item} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </AppCard>
  );
}
