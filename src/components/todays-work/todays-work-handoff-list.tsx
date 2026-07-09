import Link from "next/link";

import { EmptyState } from "@/components/design-system/EmptyState";
import { MetricCard } from "@/components/design-system/MetricCard";
import type { HandoffItem, HandoffSection, HandoffSummary } from "@/lib/todays-work";

type HandoffSummaryCardsProps = {
  summary: HandoffSummary;
};

export function HandoffSummaryCards({ summary }: HandoffSummaryCardsProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-4" data-testid="handoff-summary">
      <MetricCard label="Critical" value={summary.critical} tone="blocked" />
      <MetricCard label="High" value={summary.high} tone="warning" />
      <MetricCard label="Normal" value={summary.normal} tone="neutral" />
      <MetricCard label="Total" value={summary.total} tone="default" />
    </section>
  );
}

function HandoffListRow({ item }: { item: HandoffItem }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-zinc-900">{item.title}</p>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-600">
              {item.categoryLabel}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-zinc-600">{item.detail}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Link
            href={item.primaryHref}
            className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white touch-manipulation hover:bg-zinc-700"
          >
            {item.primaryLabel}
          </Link>
          {item.secondaryHref && item.secondaryLabel ? (
            <Link
              href={item.secondaryHref}
              className="inline-flex min-h-10 items-center rounded-md border-2 border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
            >
              {item.secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

type TodaysWorkHandoffListProps = {
  sections: HandoffSection[];
  isClear: boolean;
};

export function TodaysWorkHandoffList({ sections, isClear }: TodaysWorkHandoffListProps) {
  if (isClear) {
    return (
      <EmptyState
        icon="success"
        title="Nothing pending between teams right now"
        description="Failed checks, open repairs, call-downs, and coverage gaps will appear here when they need follow-up before the next operation."
        tone="success"
        data-testid="todays-work-handoff-list"
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="todays-work-handoff-list">
      {sections.map((section) => (
        <section key={section.key} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{section.title}</p>
          <p className="mt-1 text-sm text-zinc-600">{section.description}</p>
          <ul className="mt-4 divide-y divide-zinc-100">
            {section.items.map((item) => (
              <HandoffListRow key={item.id} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
