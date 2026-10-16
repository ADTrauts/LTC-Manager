"use client";

import { useId, useState, type ReactNode } from "react";
import { AppIcons } from "@/lib/design-system/icons";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

/** Collapsible on compact screens; always available alongside content on desktop. */
export function FilterPanel({ children, title = "Filters", summary, className = "" }: {
  children: ReactNode;
  title?: string;
  summary?: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const Chevron = AppIcons.chevronDown;
  return (
    <div className={`min-w-0 ${className}`} data-testid="responsive-filters">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        aria-label={summary ? `${title}: ${summary}` : title}
        onClick={() => setExpanded((value) => !value)}
        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-sm font-medium text-zinc-800 md:hidden ${FOCUS_RING_CLASS}`}
      >
        <span className="min-w-0 break-words">{title}{summary ? <span className="ml-2 text-xs font-normal text-zinc-600">{summary}</span> : null}</span>
        <Chevron className={`h-4 w-4 shrink-0 ${expanded ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <div id={id} className={`${expanded ? "block" : "hidden"} pt-3 md:block md:pt-0`}>
        {children}
      </div>
    </div>
  );
}
