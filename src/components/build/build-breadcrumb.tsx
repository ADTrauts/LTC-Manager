import type { ReactNode } from "react";

/**
 * Shared BUILD child-page chrome: title row + intro + optional actions.
 *
 * Location context comes from the shell mode indicator (`Build / Facility Builder`) and the
 * Build sidebar — page-level breadcrumbs were removed as redundant with that chrome.
 * Title scale matches Run PageHeader (mode difference is chrome/context, not typography).
 */
export function BuildPageHeader({
  title,
  subtitle,
  description,
  leading,
  actions,
  /** When "below", actions stack under title copy (full width). Use on Facility Builder for compact readability. */
  actionsPlacement = "aside",
  className = "",
}: {
  title: string;
  subtitle?: string;
  description?: string;
  /** Controls that sit on the title row, immediately after the heading. */
  leading?: ReactNode;
  actions?: ReactNode;
  actionsPlacement?: "aside" | "below";
  className?: string;
}) {
  const stackActions = actionsPlacement === "below";

  return (
    <div className={className.trim()} data-testid="build-page-header">
      <header
        className={
          stackActions
            ? "border-b border-zinc-200 pb-3"
            : "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-200 pb-3"
        }
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">{title}</h1>
            {leading}
          </div>
          {subtitle ? (
            <p
              className={
                description
                  ? "text-sm font-medium text-zinc-800"
                  : "max-w-3xl text-sm leading-snug text-zinc-600"
              }
            >
              {subtitle}
            </p>
          ) : null}
          {description ? (
            <p className="max-w-none text-sm leading-snug text-zinc-600 sm:max-w-3xl">{description}</p>
          ) : null}
          {stackActions && actions ? (
            <div className="pt-1" data-testid="build-page-header-actions">{actions}</div>
          ) : null}
        </div>
        {!stackActions && actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </header>
    </div>
  );
}
