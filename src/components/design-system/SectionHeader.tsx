import type { ReactNode } from "react";

export type SectionHeaderProps = {
  title?: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
  /** Muted eyebrow for de-emphasized section labels (e.g. healthy lists). */
  muted?: boolean;
  /** Larger title for operation context and pulse surfaces. */
  prominent?: boolean;
};

export function SectionHeader({
  title,
  description,
  eyebrow,
  actions,
  className = "",
  muted = false,
  prominent = false,
}: SectionHeaderProps) {
  const eyebrowClass = muted
    ? "text-xs font-semibold uppercase tracking-wider text-zinc-400"
    : "text-xs font-semibold uppercase tracking-wider text-zinc-500";

  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 ${className}`.trim()}>
      <div className="min-w-0">
        {eyebrow ? <p className={eyebrowClass}>{eyebrow}</p> : null}
        {title ? (
          <h2
            className={`font-semibold text-zinc-900 ${prominent ? "text-xl tracking-tight" : "text-lg"} ${
              eyebrow ? "mt-1" : ""
            }`}
          >
            {title}
          </h2>
        ) : null}
        {description ? <p className="mt-1 text-sm text-zinc-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
