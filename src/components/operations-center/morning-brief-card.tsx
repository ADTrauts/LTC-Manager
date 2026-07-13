"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  ensureMorningBriefAction,
  refreshMorningBriefAction,
} from "@/app/(protected)/dashboard/actions";
import { AppCard } from "@/components/design-system/AppCard";
import { StatusBadge } from "@/components/design-system/StatusBadge";
import type { MorningBriefView } from "@/lib/ai/types";
import type { StatusBadgeVariant } from "@/lib/design-system/status-styles";

type MorningBriefCardProps = {
  initialBrief: MorningBriefView;
  departmentKey: string;
  aiEnabled: boolean;
  canRefresh: boolean;
};

function originBadge(origin: MorningBriefView["origin"]): {
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

export function MorningBriefCard({
  initialBrief,
  departmentKey,
  aiEnabled,
  canRefresh,
}: MorningBriefCardProps) {
  const [brief, setBrief] = useState(initialBrief);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const autoTriedRef = useRef(false);

  useEffect(() => {
    if (!aiEnabled || !canRefresh || autoTriedRef.current) return;
    if (brief.origin === "ai" || brief.origin === "cached") return;
    if (brief.fallbackReason !== "awaiting_generation") return;

    autoTriedRef.current = true;
    startTransition(async () => {
      const result = await ensureMorningBriefAction({ departmentKey });
      if (result.ok) {
        setBrief(result.brief);
        setError(null);
      }
    });
  }, [aiEnabled, canRefresh, brief.origin, brief.fallbackReason, departmentKey, startTransition]);

  const badge = originBadge(brief.origin);
  const refreshAllowed = canRefresh && brief.canRefresh && aiEnabled;

  function onRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshMorningBriefAction({
        departmentKey,
        forceRefresh: true,
      });
      if (result.ok) {
        setBrief(result.brief);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <AppCard
      as="section"
      data-testid="morning-brief-card"
      title={brief.title}
      subtitle={brief.result.summary}
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
      <p className="text-base font-semibold text-zinc-900">{brief.result.headline}</p>

      {brief.result.priorities.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {brief.result.priorities.map((priority) => (
            <li key={`${priority.sourcePath}:${priority.title}`} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge variant={urgencyBadge(priority.urgency)}>
                  {priority.urgency === "attention"
                    ? "Needs Attention"
                    : priority.urgency === "in_progress"
                      ? "In Progress"
                      : "Monitor"}
                </StatusBadge>
                <Link
                  href={priority.sourcePath}
                  className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600"
                >
                  {priority.title}
                </Link>
              </div>
              <p className="mt-1 text-zinc-600">{priority.reason}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Based on{" "}
                <Link href={priority.sourcePath} className="underline">
                  view source
                </Link>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-zinc-600">No priority follow-ups from the current snapshot.</p>
      )}

      {brief.result.watchItems.length > 0 ? (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Watch</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
            {brief.result.watchItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-xs text-zinc-500">
        Generated {formatGeneratedAt(brief.generatedAt)}
        {brief.refreshBlockedReason && !refreshAllowed ? ` · ${brief.refreshBlockedReason}` : null}
      </p>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </AppCard>
  );
}
