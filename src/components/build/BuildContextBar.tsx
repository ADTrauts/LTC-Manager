import type { ReactNode } from "react";
import Link from "next/link";

import { statusLabelClass } from "@/lib/design-system/status-styles";

export type BuildContextBarFact = {
  /** Numeric or primary value (medium weight). */
  value: string;
  /** Optional suffix after value, e.g. Locations. */
  suffix?: string;
  /** Optional prefix before value, e.g. Manager: */
  prefix?: string;
  href?: string;
  ariaLabel?: string;
  /** Subtle active treatment when the fact targets the current tab. */
  active?: boolean;
};

export type BuildContextBarState = {
  label: string;
  tone?: "build" | "neutral" | "in_progress";
};

/**
 * Compact Build object summary — what is being shaped and what it contains so far.
 * Build Context Bar reflects the current definition of the object being configured
 * and quietly shows how it is growing over time (informational, not a checklist).
 */
export function BuildContextBar({
  title,
  subtitle,
  facts,
  state,
  footer,
  action,
  className = "",
}: {
  title: string;
  subtitle?: string;
  facts?: BuildContextBarFact[];
  state?: BuildContextBarState;
  footer?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const factItems = facts ?? [];

  return (
    <div
      className={`rounded-md border border-blue-200/80 bg-[var(--build-surface)] px-3 py-2.5 sm:px-4 sm:py-3 ${className}`.trim()}
      data-testid="build-context-bar"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1
              className="text-base font-semibold tracking-tight text-zinc-900 sm:text-lg"
              data-testid="build-context-bar-title"
            >
              {title}
            </h1>
            {action ? (
              <div className="shrink-0" data-testid="build-context-bar-action">{action}</div>
            ) : null}
          </div>
          {subtitle ? (
            <p
              className="text-xs leading-snug text-zinc-600 sm:text-sm"
              data-testid="build-context-bar-subtitle"
            >
              {subtitle}
            </p>
          ) : null}
          {factItems.length > 0 || state ? (
            <div
              className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs sm:text-sm"
              data-testid="build-context-bar-facts"
            >
              {factItems.map((fact, index) => (
                <span key={`${fact.prefix ?? ""}-${fact.value}-${fact.suffix ?? ""}-${index}`} className="inline-flex items-center">
                  {index > 0 ? (
                    <span className="mr-1 text-zinc-400" aria-hidden>·</span>
                  ) : null}
                  <BuildContextBarFactItem fact={fact} />
                </span>
              ))}
              {state ? (
                <span className="inline-flex items-center">
                  {factItems.length > 0 ? (
                    <span className="mr-1 text-zinc-400" aria-hidden>·</span>
                  ) : null}
                  <span
                    className={`inline-flex items-center gap-1.5 ${stateToneClass(state.tone)}`}
                    data-testid="build-context-bar-state"
                  >
                    {state.tone === "build" || state.tone === "in_progress" ? (
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          state.tone === "build" ? "bg-blue-600" : "bg-amber-600"
                        }`}
                        aria-hidden
                      />
                    ) : null}
                    <span>{state.label}</span>
                  </span>
                </span>
              ) : null}
            </div>
          ) : null}
          {footer ? (
            <div className="pt-0.5" data-testid="build-context-bar-footer">{footer}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function stateToneClass(tone: BuildContextBarState["tone"]): string {
  switch (tone) {
    case "build":
      return "text-blue-800";
    case "in_progress":
      return statusLabelClass("in_progress");
    case "neutral":
      return "text-zinc-600";
    default:
      return "text-zinc-700";
  }
}

function BuildContextBarFactItem({ fact }: { fact: BuildContextBarFact }) {
  const content = (
    <>
      {fact.prefix ? (
        <span className="text-zinc-500">{fact.prefix} </span>
      ) : null}
      <span className="font-medium tabular-nums text-zinc-800">{fact.value}</span>
      {fact.suffix ? (
        <span className="text-zinc-600">
          {fact.prefix || fact.value ? " " : ""}
          {fact.suffix}
        </span>
      ) : null}
    </>
  );

  const className = [
    "rounded-sm transition-colors",
    fact.href
      ? fact.active
        ? "text-blue-900 underline-offset-2 hover:underline focus-visible:underline"
        : "text-zinc-700 underline-offset-2 hover:text-zinc-900 hover:underline focus-visible:underline"
      : "",
    fact.href ? "min-h-10 inline-flex items-center py-1" : "inline-flex items-center",
  ]
    .filter(Boolean)
    .join(" ");

  if (fact.href) {
    return (
      <Link
        href={fact.href}
        className={className}
        aria-label={fact.ariaLabel}
        aria-current={fact.active ? "page" : undefined}
        data-testid="build-context-bar-fact-link"
      >
        {content}
      </Link>
    );
  }

  return (
    <span className={className} data-testid="build-context-bar-fact">
      {content}
    </span>
  );
}
