import Link from "next/link";

import { AppCard } from "@/components/design-system/AppCard";
import { EmptyState } from "@/components/design-system/EmptyState";
import { MetricCard } from "@/components/design-system/MetricCard";
import {
  OperationalListRow,
  operationalRowActionPrimaryClass,
  operationalRowActionSecondaryClass,
} from "@/components/design-system/OperationalListRow";
import { SectionHeader } from "@/components/design-system/SectionHeader";
import { StatusBadge } from "@/components/design-system/StatusBadge";
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
      status={<StatusBadge variant={item.status === "open" ? "blocked" : "ready"}>{item.statusLabel}</StatusBadge>}
      actions={
        <>
          <Link href={item.staffingHref} className={operationalRowActionPrimaryClass}>
            Fix staffing
          </Link>
          <Link href={item.coverageHref} className={operationalRowActionSecondaryClass}>
            Coverage view
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
  const openItems = items.filter((item) => item.status === "open");
  const coveredItems = items.filter((item) => item.status === "covered");
  const primaryOpen = openItems[0] ?? null;
  const remainingOpen = openItems.slice(1);

  if (items.length === 0) {
    return (
      <AppCard as="section" title="Open call-downs" data-testid="todays-work-call-down-list">
        <p className="text-sm text-zinc-500">No call-down overrides logged for today.</p>
      </AppCard>
    );
  }

  return (
    <AppCard as="section" data-testid="todays-work-call-down-list">
      <SectionHeader
        eyebrow="Call-downs"
        title="Open coverage risks"
        description="Overrides logged with call-down reasons stay visible until the affected location is covered."
        actions={
          !compact ? (
            <Link
              href="/staffing"
              className="inline-flex min-h-11 items-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100"
            >
              Log call-down
            </Link>
          ) : undefined
        }
      />

      {primaryOpen ? (
        <div className="mt-4">
          <SectionHeader eyebrow="Resolve first" className="mb-3" />
          <ul>
            <CallDownListRow item={primaryOpen} emphasized />
          </ul>
        </div>
      ) : (
        <EmptyState
          className="mt-4"
          title="All logged call-downs are covered for today."
          tone="success"
        />
      )}

      {remainingOpen.length > 0 ? (
        <div className="mt-4">
          <SectionHeader eyebrow="Other open call-downs" className="mb-3" />
          <ul className="divide-y divide-zinc-100">
            {remainingOpen.map((item) => (
              <CallDownListRow key={item.id} item={item} />
            ))}
          </ul>
        </div>
      ) : null}

      {!compact && coveredItems.length > 0 ? (
        <div className="mt-4">
          <SectionHeader eyebrow="Covered today" muted className="mb-3" />
          <AppCard as="div" className="border-dashed bg-zinc-50/80 px-4 py-0 shadow-none sm:px-4 sm:py-0">
            <ul className="divide-y divide-zinc-100">
              {(compact ? coveredItems.slice(0, 3) : coveredItems).map((item) => (
                <CallDownListRow key={item.id} item={item} />
              ))}
            </ul>
          </AppCard>
        </div>
      ) : null}
    </AppCard>
  );
}
