"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  ensureRecoveryAssistantAction,
  refreshRecoveryAssistantAction,
} from "@/app/(protected)/issues/recovery-actions";
import { AppCard } from "@/components/design-system/AppCard";
import { OperationalListRow } from "@/components/design-system/OperationalListRow";
import { StatusBadge } from "@/components/design-system/StatusBadge";
import type { RecoveryAssistantView } from "@/lib/ai/recovery-assistant/types";
import type { StatusBadgeVariant } from "@/lib/design-system/status-styles";

type RecoveryAssistantCardProps = {
  initialGuidance: RecoveryAssistantView;
  issueId: string;
  departmentKey: string;
  aiEnabled: boolean;
  canRefresh: boolean;
};

function originBadge(origin: RecoveryAssistantView["origin"]): {
  variant: StatusBadgeVariant;
  label: string;
} {
  if (origin === "ai") return { variant: "ready", label: "AI-generated" };
  if (origin === "cached") return { variant: "in_progress", label: "Cached" };
  return { variant: "neutral", label: "Operational guidance" };
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

export function RecoveryAssistantCard({
  initialGuidance,
  issueId,
  departmentKey,
  aiEnabled,
  canRefresh,
}: RecoveryAssistantCardProps) {
  const [guidance, setGuidance] = useState(initialGuidance);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const autoTriedRef = useRef(false);

  useEffect(() => {
    if (!aiEnabled || !canRefresh || autoTriedRef.current) return;
    if (guidance.origin === "ai" || guidance.origin === "cached") return;
    if (guidance.fallbackReason !== "awaiting_generation") return;

    autoTriedRef.current = true;
    startTransition(async () => {
      const result = await ensureRecoveryAssistantAction({ issueId, departmentKey });
      if (result.ok) {
        setGuidance(result.guidance);
        setError(null);
      }
    });
  }, [
    aiEnabled,
    canRefresh,
    guidance.origin,
    guidance.fallbackReason,
    issueId,
    departmentKey,
    startTransition,
  ]);

  const badge = originBadge(guidance.origin);
  const refreshAllowed = canRefresh && guidance.canRefresh && aiEnabled;

  function onRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshRecoveryAssistantAction({
        issueId,
        departmentKey,
        forceRefresh: true,
      });
      if (result.ok) {
        setGuidance(result.guidance);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <AppCard
      as="section"
      data-testid="recovery-assistant-card"
      title={guidance.cardTitle}
      subtitle="Decision support only — does not change issue records"
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
      <p className="text-base font-semibold text-zinc-900">{guidance.result.headline}</p>
      <p className="mt-1 text-sm text-zinc-600">{guidance.result.situation}</p>

      {guidance.result.checkFirst.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Check first</p>
          <ul className="mt-2 space-y-2">
            {guidance.result.checkFirst.map((item) => (
              <li key={item.action}>
                <OperationalListRow
                  title={item.action}
                  description={item.reason}
                  href={item.sourcePath ?? undefined}
                  status={<StatusBadge variant="warning">Check</StatusBadge>}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {guidance.result.recoveryOptions.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Recovery options
          </p>
          <ul className="mt-2 space-y-2">
            {guidance.result.recoveryOptions.map((item) => (
              <li key={item.title}>
                <OperationalListRow
                  title={item.title}
                  description={item.description}
                  href={item.sourcePath ?? undefined}
                  status={
                    <StatusBadge variant={item.confidence === "supported" ? "ready" : "neutral"}>
                      {item.confidence === "supported" ? "Supported" : "Conditional"}
                    </StatusBadge>
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {guidance.result.missingInformation.length > 0 ? (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Information still needed
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
            {guidance.result.missingInformation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {guidance.result.knowledgeUsed.length > 0 ? (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Guidance used
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {guidance.result.knowledgeUsed.map((item) => (
              <li key={item.sourcePath}>
                <Link
                  href={item.sourcePath}
                  className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2"
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-xs text-zinc-500">
        Generated {formatGeneratedAt(guidance.generatedAt)}
        {guidance.refreshBlockedReason && !refreshAllowed
          ? ` · ${guidance.refreshBlockedReason}`
          : null}
      </p>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </AppCard>
  );
}
