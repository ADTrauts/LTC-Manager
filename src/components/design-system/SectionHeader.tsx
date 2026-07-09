import type { ReactNode } from "react";

export type SectionHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, description, eyebrow, actions, className = "" }: SectionHeaderProps) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 ${className}`.trim()}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{eyebrow}</p>
        ) : null}
        <h2 className={`text-lg font-semibold text-zinc-900 ${eyebrow ? "mt-1" : ""}`}>{title}</h2>
        {description ? <p className="mt-1 text-sm text-zinc-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
