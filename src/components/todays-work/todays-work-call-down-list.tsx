import Link from "next/link";

import { MetricCard } from "@/components/design-system/MetricCard";
import type { CallDownItem, CallDownSummary } from "@/lib/todays-work";

type CallDownSummaryCardsProps = {
  summary: CallDownSummary;
};

export function CallDownSummaryCards({ summary }: CallDownSummaryCardsProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-3" data-testid="call-down-summary">
      <MetricCard label="Open" value={summary.open} hint="Needs coverage follow-up" tone="blocked" />
      <MetricCard label="Covered" value={summary.covered} hint="Gap resolved today" tone="ready" />
      <MetricCard label="Logged today" value={summary.total} hint="Call-down overrides" tone="neutral" />
    </section>
  );
}

type CallDownListRowProps = {
  item: CallDownItem;
  emphasized?: boolean;
};

function CallDownListRow({ item, emphasized = false }: CallDownListRowProps) {
  const movement =
    item.oldUnitName && item.oldUnitName !== item.newUnitName
      ? `${item.oldUnitName} → ${item.newUnitName}`
      : item.oldUnitName ?? item.newUnitName;

  return (
    <li>
      <div
        className={`flex flex-wrap items-start gap-3 ${
          emphasized ? "rounded-xl border-2 border-zinc-900 bg-zinc-50 p-4 shadow-sm" : "py-3"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`font-semibold text-zinc-900 ${emphasized ? "text-lg" : ""}`}>{item.employeeName}</p>
            {item.templateLabel ? (
              <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700">
                {item.templateLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-zinc-600">{item.reason}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {movement}
            {item.mealType ? ` · ${item.mealType}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
            item.status === "open"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {item.statusLabel}
        </span>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Link
            href={item.staffingHref}
            className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white touch-manipulation hover:bg-zinc-700"
          >
            Fix staffing
          </Link>
          <Link
            href={item.coverageHref}
            className="inline-flex min-h-10 items-center rounded-md border-2 border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
          >
            Coverage view
          </Link>
        </div>
      </div>
    </li>
  );
}

type TodaysWorkCallDownListProps = {
  items: CallDownItem[];
  compact?: boolean;
};

export function TodaysWorkCallDownList({ items, compact = false }: TodaysWorkCallDownListProps) {
  const openItems = items.filter((item) => item.status === "open");
  const coveredItems = items.filter((item) => item.status === "covered");
  const primaryOpen = openItems[0] ?? null;
  const remainingOpen = openItems.slice(1);

  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="todays-work-call-down-list">
        <p className="text-sm font-semibold text-zinc-900">Open call-downs</p>
        <p className="mt-2 text-sm text-zinc-500">No call-down overrides logged for today.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="todays-work-call-down-list">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Call-downs</p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-900">Open coverage risks</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Overrides logged with call-down reasons stay visible until the affected location is covered.
          </p>
        </div>
        {!compact ? (
          <Link
            href="/staffing"
            className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
          >
            Log call-down
          </Link>
        ) : null}
      </div>

      {primaryOpen ? (
        <div className="mt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Resolve first</p>
          <ul>
            <CallDownListRow item={primaryOpen} emphasized />
          </ul>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          All logged call-downs are covered for today.
        </p>
      )}

      {remainingOpen.length > 0 ? (
        <div className="mt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Other open call-downs</p>
          <ul className="divide-y divide-zinc-100">
            {remainingOpen.map((item) => (
              <CallDownListRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      ) : null}

      {!compact && coveredItems.length > 0 ? (
        <div className="mt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Covered today</p>
          <ul className="divide-y divide-zinc-100 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4">
            {(compact ? coveredItems.slice(0, 3) : coveredItems).map((item) => (
              <CallDownListRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
