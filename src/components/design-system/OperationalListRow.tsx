import Link from "next/link";
import type { ReactNode } from "react";

export function operationalListRowClass(emphasized = false): string {
  return emphasized ? "rounded-xl border-2 border-zinc-900 bg-zinc-50 p-4 shadow-sm" : "py-3";
}

export const operationalRowActionPrimaryClass =
  "inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white touch-manipulation hover:bg-zinc-700";

export const operationalRowActionSecondaryClass =
  "inline-flex min-h-10 items-center rounded-md border-2 border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-100";

/** Shared list container for operational rows inside a page card. */
export const operationalListShellClass = "overflow-hidden rounded-xl border border-zinc-200 bg-white px-4";

export const operationalListShellMutedClass =
  "overflow-hidden rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4";

export type OperationalListRowProps = {
  emphasized?: boolean;
  /** When set, the full row navigates to this href (walk list pattern). */
  href?: string;
  rank?: number;
  title: string;
  meta?: ReactNode;
  description?: string;
  details?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function OperationalListRow({
  emphasized = false,
  href,
  rank,
  title,
  meta,
  description,
  details,
  status,
  actions,
  className = "",
}: OperationalListRowProps) {
  const surfaceClass = `flex flex-wrap items-start gap-3 ${operationalListRowClass(emphasized)} ${className}`.trim();
  const titleClass = `font-semibold text-zinc-900 ${emphasized ? "text-lg" : ""}`;

  const body = (
    <>
      {rank != null ? (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            emphasized ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {rank}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={titleClass}>{title}</p>
          {meta}
        </div>
        {description ? <p className="mt-0.5 text-sm text-zinc-600">{description}</p> : null}
        {details}
      </div>
      {status ? <div className="shrink-0 self-start">{status}</div> : null}
      {actions ? (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{actions}</div>
      ) : null}
    </>
  );

  return (
    <li>
      {href ? (
        <Link href={href} className={`${surfaceClass} touch-manipulation hover:bg-zinc-50`}>
          {body}
        </Link>
      ) : (
        <div className={surfaceClass}>{body}</div>
      )}
    </li>
  );
}
