"use client";

import { useEffect, useState } from "react";

import { getOfflineRuntimeSnapshot } from "@/lib/offline/sync-engine";

/**
 * Read-only confirmed Assignment context from the offline Runtime bundle.
 * Never edits Assignments. Shows only the current actor's context.
 */
export function OfflineAssignmentContext() {
  const [ctx, setCtx] = useState<{
    duty: string;
    unitName: string | null;
    startsAt: string | null;
    endsAt: string | null;
    confirmedAt: string | null;
    lastSyncedAt: string;
  } | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snap = await getOfflineRuntimeSnapshot();
      if (cancelled) return;
      const assignment = snap.bundle?.assignmentContext ?? null;
      setCtx(
        assignment
          ? {
              duty: assignment.duty,
              unitName: assignment.unitName,
              startsAt: assignment.startsAt,
              endsAt: assignment.endsAt,
              confirmedAt: assignment.confirmedAt,
              lastSyncedAt: assignment.lastSyncedAt,
            }
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (ctx === undefined) return null;

  if (!ctx) {
    return (
      <article
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
        data-testid="offline-assignment-context"
      >
        <p className="text-xs font-medium text-zinc-500">Assignment</p>
        <p className="text-sm text-zinc-700">Assignment not confirmed. Check with your Supervisor.</p>
      </article>
    );
  }

  const fmt = (iso: string | null) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return null;
    }
  };

  const start = fmt(ctx.startsAt);
  const end = fmt(ctx.endsAt);

  return (
    <article
      className="rounded-lg border border-zinc-200 bg-white px-3 py-2"
      data-testid="offline-assignment-context"
    >
      <p className="text-xs font-medium text-zinc-500">Your assignment (read-only)</p>
      <p className="text-sm font-semibold text-zinc-900">
        {ctx.duty}
        {ctx.unitName ? ` — ${ctx.unitName}` : ""}
      </p>
      {start && end ? (
        <p className="text-xs text-zinc-600">
          {start}–{end}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-zinc-500">
        Last synchronized {new Date(ctx.lastSyncedAt).toLocaleString()}
        {ctx.confirmedAt ? ` · Confirmed ${new Date(ctx.confirmedAt).toLocaleString()}` : ""}
      </p>
    </article>
  );
}
