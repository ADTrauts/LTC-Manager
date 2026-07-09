import type { ReactNode } from "react";

export type AppCardProps = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
  as?: "article" | "section" | "div";
  "data-testid"?: string;
};

function AppCardSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="h-4 w-2/5 rounded bg-zinc-200" />
      <div className="h-3 w-3/5 rounded bg-zinc-100" />
      <div className="h-16 rounded-lg bg-zinc-100" />
    </div>
  );
}

export function AppCard({
  title,
  subtitle,
  actions,
  loading = false,
  className = "",
  children,
  as: Root = "article",
  "data-testid": dataTestId,
}: AppCardProps) {
  const hasHeader = Boolean(title || subtitle || actions);

  return (
    <Root
      className={`rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 ${className}`.trim()}
      data-testid={dataTestId}
    >
      {hasHeader ? (
        <div
          className={`flex flex-wrap items-start justify-between gap-3 ${children || loading ? "mb-4" : ""}`.trim()}
        >
          <div className="min-w-0">
            {title ? <h2 className="text-lg font-semibold text-zinc-900">{title}</h2> : null}
            {subtitle ? <p className="mt-1 text-sm text-zinc-600">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {loading ? <AppCardSkeleton /> : children}
    </Root>
  );
}
