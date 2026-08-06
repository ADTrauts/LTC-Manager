"use client";

import { useEffect, useState } from "react";

import { getOfflineRuntimeSnapshot } from "@/lib/offline/sync-engine";

type OfflineJobFlowSnapshot = {
  state: string;
  unitName: string | null;
  duty: string | null;
  expectation: string | null;
  mealTargetTime: string | null;
  cycleLabel: string | null;
  nextCycleLabel: string | null;
  lastSyncedAt: string;
  stale: boolean;
};

/**
 * Read-only Job Flow expectation strip from the offline Runtime bundle.
 * No mutations — surfaces last-synced expectation only.
 */
export function OfflineJobFlowContext() {
  const [ctx, setCtx] = useState<OfflineJobFlowSnapshot | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snap = await getOfflineRuntimeSnapshot();
      if (cancelled) return;
      const jobFlow = snap.bundle?.jobFlowContext ?? null;
      setCtx(
        jobFlow
          ? {
              state: jobFlow.state,
              unitName: jobFlow.unitName,
              duty: jobFlow.duty,
              expectation: jobFlow.expectation,
              mealTargetTime: jobFlow.mealTargetTime,
              cycleLabel: jobFlow.cycleLabel,
              nextCycleLabel: jobFlow.nextCycleLabel,
              lastSyncedAt: jobFlow.lastSyncedAt,
              stale: jobFlow.stale,
            }
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (ctx === undefined || ctx === null) return null;

  return (
    <article
      className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
      data-testid="offline-job-flow-context"
    >
      <p className="text-xs font-medium text-zinc-500">Job Flow (read-only)</p>
      {ctx.duty || ctx.unitName ? (
        <p className="text-sm font-semibold text-zinc-900">
          {ctx.duty ?? "Duty"}
          {ctx.unitName ? ` — ${ctx.unitName}` : ""}
        </p>
      ) : null}
      {ctx.expectation ? <p className="text-sm text-zinc-700">{ctx.expectation}</p> : null}
      {ctx.cycleLabel || ctx.mealTargetTime ? (
        <p className="text-xs text-zinc-600">
          {ctx.cycleLabel ?? "Cycle"}
          {ctx.mealTargetTime ? ` · target ${ctx.mealTargetTime}` : ""}
        </p>
      ) : null}
      {ctx.nextCycleLabel ? (
        <p className="text-xs text-zinc-500">Next: {ctx.nextCycleLabel}</p>
      ) : null}
      <p className="mt-1 text-xs text-zinc-500">
        Last synchronized {new Date(ctx.lastSyncedAt).toLocaleString()}
        {ctx.stale ? " · Stale" : ""}
      </p>
    </article>
  );
}
