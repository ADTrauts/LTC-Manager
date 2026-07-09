import type { ReactNode } from "react";

import { AppIcons, type AppIconKey } from "@/lib/design-system/icons";

export type ActionCardProps = {
  title: string;
  description: string;
  icon: AppIconKey;
  cta: ReactNode;
  emphasized?: boolean;
  className?: string;
  "data-testid"?: string;
};

export function ActionCard({
  title,
  description,
  icon,
  cta,
  emphasized = false,
  className = "",
  "data-testid": dataTestId,
}: ActionCardProps) {
  const Icon = AppIcons[icon];

  return (
    <article
      className={`rounded-xl border bg-white p-4 shadow-sm sm:p-5 ${
        emphasized ? "border-2 border-zinc-900 bg-zinc-50" : "border-zinc-200"
      } ${className}`.trim()}
      data-testid={dataTestId}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700"
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={`font-semibold text-zinc-900 ${emphasized ? "text-lg sm:text-xl" : "text-base"}`}>
            {title}
          </h3>
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
          <div className="mt-4">{cta}</div>
        </div>
      </div>
    </article>
  );
}
