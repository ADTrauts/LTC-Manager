"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  ensureShiftTransitionAction,
  refreshShiftTransitionAction,
} from "@/app/(protected)/today/handoffs/actions";
import { AppCard } from "@/components/design-system/AppCard";
import { OperationalListRow } from "@/components/design-system/OperationalListRow";
import { StatusBadge } from "@/components/design-system/StatusBadge";
import type { ShiftTransitionView } from "@/lib/ai/shift-transition/types";
import type { StatusBadgeVariant } from "@/lib/design-system/status-styles";

type ShiftTransitionSummaryCardProps = {
  initialSummary: ShiftTransitionView;
  departmentKey: string;
  aiEnabled: boolean;
  canRefresh: boolean;
};

function originBadge(origin: ShiftTransitionView["origin"]): {
  variant: StatusBadgeVariant;
  label: string;
} {
  if (origin === "ai") return { variant: "ready", label: "AI-generated" };
  if (origin === "cached") return { variant: "in_progress", label: "Cached" };
  return { variant: "neutral", label: "Operational fallback" };
}

function urgencyBadge(urgency: string): StatusBadgeVariant {
  if (urgency === "attention") return "blocked";
  if (urgency === "in_progress") return "in_progress";
  return "neutral";
}

function formatGeneratedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ShiftTransitionSummaryCard({
  initialSummary,
  departmentKey,
  aiEnabled,
  canRefresh,
}: ShiftTransitionSummaryCardProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const autoTriedRef = useRef(false);

  useEffect(() => {
    if (!aiEnabled || !canRefresh || autoTriedRef.current) return;
    if (summary.origin === "ai" || summary.origin === "cached") return;
    if (summary.fallbackReason !== "awaiting_generation") return;

    autoTriedRef.current = true;
    startTransition(async () => {
      const result = await ensureShiftTransitionAction({ departmentKey });
      if (result.ok) {
        setSummary(result.summary);
        setError(null);
      }
    });
  }, [
    aiEnabled,
    canRefresh,
    summary.origin,
    summary.fallbackReason,
    departmentKey,
    startTransition,
  ]);

  const badge = originBadge(summary.origin);
  const refreshAllowed = canRefresh && summary.canRefresh && aiEnabled;

  function onRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshShiftTransitionAction({
        departmentKey,
        forceRefresh: true,
      });
      if (result.ok) {
        setSummary(result.summary);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <AppCard
      as="section"
      data-testid="shift-transition-summary-card"
      title={summary.cardTitle}
      subtitle={summary.windowLabel}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant={badge.variant}>{badge.label}</StatusBadge>
          {refreshAllowed ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={pending}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
            >
              {pending ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
        </div>
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {summary.contextLabel}
      </p>
      <p className="mt-1 text-base font-semibold text-zinc-900">{summary.result.title}</p>
      <p className="mt-1 text-sm text-zinc-600">{summary.result.summary}</p>

      {summary.result.resolved.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Resolved this shift
          </p>
          <ul className="mt-2 space-y-2">
            {summary.result.resolved.map((item) => (
              <li key={item.text}>
                <OperationalListRow
                  title={item.text}
                  status={<StatusBadge variant="ready">Improved</StatusBadge>}
                  href={item.sourcePath ?? undefined}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.result.carryForward.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Carry forward
          </p>
          <ul className="mt-2 space-y-2">
            {summary.result.carryForward.map((item) => (
              <li key={`${item.sourcePath}:${item.title}`}>
                <OperationalListRow
                  emphasized={item.urgency === "attention"}
                  title={item.title}
                  description={item.reason}
                  href={item.sourcePath}
                  status={
                    <StatusBadge variant={urgencyBadge(item.urgency)}>
                      {item.urgency === "attention"
                        ? "Needs Attention"
                        : item.urgency === "in_progress"
                          ? "In Progress"
                          : "Monitor"}
                    </StatusBadge>
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-600">No carry-forward items from the current snapshot.</p>
      )}

      {summary.result.changed.length > 0 ? (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">What changed</p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
            {summary.result.changed.map((item) => (
              <li key={`${item.direction}:${item.text}`}>
                {item.sourcePath ? (
                  <Link href={item.sourcePath} className="underline decoration-zinc-300 underline-offset-2">
                    {item.text}
                  </Link>
                ) : (
                  item.text
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!summary.result.baselineAvailable ? (
        <p className="mt-3 text-xs text-zinc-500">
          No comparison baseline was available for this window.
        </p>
      ) : null}

      <p className="mt-4 text-xs text-zinc-500">
        Generated {formatGeneratedAt(summary.generatedAt)}
        {summary.refreshBlockedReason && !refreshAllowed
          ? ` · ${summary.refreshBlockedReason}`
          : null}
      </p>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </AppCard>
  );
}
