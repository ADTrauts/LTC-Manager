import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { AppCard, StatusBadge, type StatusBadgeProps } from "@/components/design-system";
import type { ReviewSummaryItem } from "@/lib/operational-review/present-operational-review-day";

export function ReviewCard({
  title,
  subtitle,
  children,
  testId,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <AppCard title={title} subtitle={subtitle} data-testid={testId}>
      {children}
    </AppCard>
  );
}

export function ReviewTable({
  caption,
  columns,
  children,
}: {
  caption: string;
  columns: readonly string[];
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <table role="table" className="review-table min-w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500">
            {columns.map((column) => (
              <th key={column} scope="col" className="py-2 pr-3 font-medium last:pr-0">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">{Children.map(children, (child) => isValidElement(child)
          ? cloneElement(child as ReactElement<{ labels?: readonly string[] }>, { labels: columns })
          : child)}</tbody>
      </table>
    </div>
  );
}

export function ReviewTableRow({ children, labels }: { children: ReactNode; labels?: readonly string[] }) {
  return <tr role="row" className="border-b border-zinc-100 align-top last:border-b-0">{
    Children.map(children, (child, index) => isValidElement(child)
      ? cloneElement(child as ReactElement<{ label?: string }>, { label: labels?.[index] })
      : child)
  }</tr>;
}

export function ReviewCell({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return <td role="cell" className={`py-2 pr-3 text-zinc-800 last:pr-0 ${className}`.trim()}>
    {label ? <span className="review-cell-label" aria-hidden>{label}</span> : null}
    <div className="min-w-0">{children}</div>
  </td>;
}

export function ReviewCountList({ items }: { items: readonly ReviewSummaryItem[] }) {
  return (
    <div className="space-y-2 text-sm">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-3 rounded border border-zinc-200 px-3 py-2"
        >
          <span className="text-zinc-700">{item.name}</span>
          <span className="font-semibold tabular-nums text-zinc-900">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export function ReviewMuted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>;
}

export function reviewStatusVariant(
  kind: "ok" | "alert" | "progress" | "neutral",
): StatusBadgeProps["variant"] {
  if (kind === "alert") return "blocked";
  if (kind === "progress") return "warning";
  if (kind === "ok") return "success";
  return "neutral";
}

export function ReviewStatus({
  kind,
  children,
}: {
  kind: "ok" | "alert" | "progress" | "neutral";
  children: ReactNode;
}) {
  return (
    <StatusBadge variant={reviewStatusVariant(kind)} prominence={kind === "ok" ? "quiet" : "default"}>
      {children}
    </StatusBadge>
  );
}
