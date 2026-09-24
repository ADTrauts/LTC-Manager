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
 * Count facts sit on the right as a stat strip; identity facts stay with the title.
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
  const identityFacts = factItems.filter((fact) => fact.prefix);
  const statFacts = factItems.filter((fact) => !fact.prefix);

  return (
    <div
      className={`rounded-md border border-blue-200/80 bg-[var(--build-surface)] px-3 py-2.5 sm:px-4 sm:py-3 ${className}`.trim()}
      data-testid="build-context-bar"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
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
          {identityFacts.length > 0 || state ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
              {identityFacts.map((fact, index) => (
                <BuildContextBarIdentityFact key={`${fact.prefix}-${fact.value}-${index}`} fact={fact} />
              ))}
              {state ? (
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
              ) : null}
            </div>
          ) : null}
          {footer ? (
            <div className="pt-0.5" data-testid="build-context-bar-footer">{footer}</div>
          ) : null}
        </div>

        {statFacts.length > 0 ? (
          <div
            className="flex flex-wrap items-end gap-x-5 gap-y-3 sm:justify-end sm:pt-0.5"
            data-testid="build-context-bar-facts"
          >
            {statFacts.map((fact, index) => (
              <BuildContextBarStatFact
                key={`${fact.value}-${fact.suffix ?? ""}-${index}`}
                fact={fact}
              />
            ))}
          </div>
        ) : null}
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

function BuildContextBarIdentityFact({ fact }: { fact: BuildContextBarFact }) {
  const content = (
    <>
      <span className="text-zinc-500">{fact.prefix} </span>
      <span className="font-medium text-zinc-800">{fact.value}</span>
      {fact.suffix ? <span className="text-zinc-600"> {fact.suffix}</span> : null}
    </>
  );

  if (fact.href) {
    return (
      <Link
        href={fact.href}
        className={`rounded-sm underline-offset-2 hover:underline focus-visible:underline ${
          fact.active ? "text-blue-900" : "text-zinc-700 hover:text-zinc-900"
        }`}
        aria-label={fact.ariaLabel}
        aria-current={fact.active ? "page" : undefined}
        data-testid="build-context-bar-fact-link"
      >
        {content}
      </Link>
    );
  }

  return (
    <span data-testid="build-context-bar-fact">{content}</span>
  );
}

function BuildContextBarStatFact({ fact }: { fact: BuildContextBarFact }) {
  const content = (
    <>
      <span
        className={`text-2xl font-semibold tabular-nums leading-none tracking-tight sm:text-3xl ${
          fact.active ? "text-orange-800" : "text-[var(--build-accent-text)]"
        }`}
      >
        {fact.value}
      </span>
      {fact.suffix ? (
        <span className="mt-1 text-[11px] font-medium leading-tight text-zinc-600 sm:text-xs">
          {fact.suffix}
        </span>
      ) : null}
    </>
  );

  const className = [
    "flex min-w-[3.5rem] flex-col items-start sm:items-end",
    fact.href
      ? `rounded-md px-1 py-0.5 transition-colors hover:bg-orange-100/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-800 ${
          fact.active ? "bg-orange-100/80" : ""
        }`
      : "",
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
