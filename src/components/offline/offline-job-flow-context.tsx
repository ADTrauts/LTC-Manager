"use client";

import { useEffect, useState } from "react";

import { getOfflineRuntimeSnapshot } from "@/lib/offline/sync-engine";
import type { OfflineJobFlowItemSnapshot } from "@/lib/offline/types";
import { readOfflineJobFlowItems } from "@/lib/employee-runtime-flow";

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
  items: OfflineJobFlowItemSnapshot[];
  snapshotOperationalDate: string | null;
};

/**
 * Read-only Job Flow expectation strip from the offline Runtime bundle.
 * Phase 2C-2D: when jobFlowItemContext is present, list canonical items once.
 * Does not invent offline actions — badges reflect offlineAction from the snapshot.
 */
export function OfflineJobFlowContext() {
  const [ctx, setCtx] = useState<OfflineJobFlowSnapshot | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snap = await getOfflineRuntimeSnapshot();
      if (cancelled) return;
      const jobFlow = snap.bundle?.jobFlowContext ?? null;
      const items = snap.bundle ? readOfflineJobFlowItems(snap.bundle) : [];
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
              items,
              snapshotOperationalDate: snap.bundle?.jobFlowItemContext?.snapshotOperationalDate ?? null,
            }
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (ctx === undefined || ctx === null) return null;

  const displayItems = ctx.items.filter((row) => !row.informational);
  const notices = ctx.items.filter((row) => row.informational);

  return (
    <article
      className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
      data-testid="offline-job-flow-context"
    >
      <p className="text-xs font-medium text-zinc-500">Job Flow (cached)</p>
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

      {displayItems.length > 0 ? (
        <ul className="mt-2 space-y-1" data-testid="offline-job-flow-items">
          {displayItems.map((item) => (
            <li
              key={`${item.ownerKind}:${item.ownerId}`}
              className="rounded border border-zinc-100 px-2 py-1.5"
              data-testid="offline-job-flow-item"
              data-owner-kind={item.ownerKind}
              data-offline-action={item.offlineAction ?? "none"}
            >
              <p className="text-sm font-medium text-zinc-900">{item.label}</p>
              <p className="text-xs text-zinc-600">
                {item.attention.replaceAll("_", " ")}
                {item.offlineAction ? " · can sync later" : " · view only"}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {notices.length > 0 ? (
        <ul className="mt-2 space-y-1" data-testid="offline-job-flow-notices">
          {notices.map((item) => (
            <li key={`${item.ownerKind}:${item.ownerId}`} className="text-xs text-zinc-600">
              Notice: {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-1 text-xs text-zinc-500">
        Last synchronized {new Date(ctx.lastSyncedAt).toLocaleString()}
        {ctx.snapshotOperationalDate ? ` · service date ${ctx.snapshotOperationalDate}` : ""}
        {ctx.stale ? " · Stale snapshot" : ""}
      </p>
    </article>
  );
}
