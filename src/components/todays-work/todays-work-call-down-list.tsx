import Link from "next/link";

import { AppCard } from "@/components/design-system/AppCard";
import { OperationalListRow, operationalRowActionPrimaryClass, operationalRowActionSecondaryClass } from "@/components/design-system/OperationalListRow";
import { SectionHeader } from "@/components/design-system/SectionHeader";
import { StatusBadge } from "@/components/design-system/StatusBadge";
import type { CallDownItem, CallDownSummary } from "@/lib/todays-work";

type CallDownSummaryCardsProps = {
  summary: CallDownSummary;
};

export function CallDownSummaryCards({ summary }: CallDownSummaryCardsProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-2" data-testid="call-down-summary">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Logged today</p>
        <p className="mt-1 text-2xl font-semibold text-zinc-900">{summary.total}</p>
        <p className="mt-1 text-xs text-zinc-500">Call-off presence facts</p>
      </div>
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
    <OperationalListRow
      emphasized={emphasized}
      title={item.employeeName}
      meta={item.templateLabel ? <StatusBadge variant="neutral">{item.templateLabel}</StatusBadge> : undefined}
      description={item.reason}
      details={
        <p className="mt-1 text-xs text-zinc-500">
          {movement}
          {item.mealType ? ` · ${item.mealType}` : ""}
        </p>
      }
      status={<StatusBadge variant="neutral">{item.statusLabel}</StatusBadge>}
      actions={
        <>
          <Link href={item.staffingHref} className={operationalRowActionPrimaryClass}>
            Staffing
          </Link>
          <Link href={item.coverageHref} className={operationalRowActionSecondaryClass}>
            Assignment Board
          </Link>
        </>
      }
    />
  );
}

type TodaysWorkCallDownListProps = {
  items: CallDownItem[];
  compact?: boolean;
};

export function TodaysWorkCallDownList({ items, compact = false }: TodaysWorkCallDownListProps) {
  if (items.length === 0) {
    return (
      <AppCard as="section" title="Call-offs" data-testid="todays-work-call-down-list">
        <p className="text-sm text-zinc-500">No call-offs logged for today.</p>
      </AppCard>
    );
  }

  return (
    <AppCard as="section" data-testid="todays-work-call-down-list">
      <SectionHeader
        eyebrow="Call-offs"
        title="Who called off"
        description="Presence facts logged today. Coverage and assignment live on Staffing."
        actions={
          !compact ? (
            <Link
              href="/staffing"
              className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
            >
              Staffing
            </Link>
          ) : undefined
        }
        className="border-b border-zinc-100 pb-4"
      />

      <ul className="divide-y divide-zinc-100 pt-4">
        {items.map((item, index) => (
          <CallDownListRow key={item.id} item={item} emphasized={!compact && index === 0} />
        ))}
      </ul>
    </AppCard>
  );
}
