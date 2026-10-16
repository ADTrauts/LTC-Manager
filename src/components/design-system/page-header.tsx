import type { ReactNode } from "react";

import { AppIcons, type AppIconKey } from "@/lib/design-system/icons";

export type PageHeaderProps = {
  /** Registry key — never import Lucide icons directly in pages. */
  icon?: AppIconKey;
  title: string;
  /** Zone or section label above the title. */
  eyebrow?: string;
  subtitle?: string;
  /** Readiness chips, badges, or short status cues beside the title row. */
  status?: ReactNode;
  /** Right-aligned actions (links, buttons). */
  actions?: ReactNode;
  /** Tighter vertical rhythm for nested operational views. */
  compact?: boolean;
  /** Optional content below the title row (e.g. operation context banner). */
  below?: ReactNode;
  /** Use `div` when nesting inside another page header shell. */
  as?: "header" | "div";
  className?: string;
};

export function PageHeader({
  icon,
  title,
  eyebrow,
  subtitle,
  status,
  actions,
  compact = false,
  below,
  as: Root = "header",
  className = "",
}: PageHeaderProps) {
  const Icon = icon ? AppIcons[icon] : null;

  return (
    <Root
      className={`border-b border-zinc-200 ${compact ? "space-y-2 pb-3 sm:pb-4" : "space-y-2 pb-3 sm:space-y-3 sm:pb-5"} ${className}`.trim()}
    >
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
          {Icon ? (
            <span
              className={`flex shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-600 ${
                compact ? "h-9 w-9" : "h-10 w-10"
              }`}
              aria-hidden
            >
              <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
            </span>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{eyebrow}</p>
            ) : null}
            <div className={`flex flex-wrap items-center gap-2 ${eyebrow ? "mt-1" : ""}`}>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                {title}
              </h1>
              {status ? <div className="shrink-0">{status}</div> : null}
            </div>
            {subtitle ? (
              <p className={`max-w-2xl text-sm text-zinc-600 ${eyebrow ? "mt-1" : "mt-1"}`}>{subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {below ? <div className="space-y-3 pt-1">{below}</div> : null}
    </Root>
  );
}
