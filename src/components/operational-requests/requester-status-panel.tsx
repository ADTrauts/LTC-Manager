"use client";

import { useEffect, useState } from "react";

import { loadRequesterStatusAction } from "@/app/(protected)/operational-requests/actions";
import type { RequesterVisibleRequestStatus } from "@/lib/operational-requests";

type Props = {
  requestingDepartmentId: string;
  requestId: string;
};

/**
 * Limited requester-visible status panel — no triage notes or vendor internals.
 */
export function RequesterStatusPanel({ requestingDepartmentId, requestId }: Props) {
  const [status, setStatus] = useState<RequesterVisibleRequestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRequesterStatusAction({ requestingDepartmentId, requestId })
      .then((row) => {
        if (!cancelled) setStatus(row);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load status.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestingDepartmentId, requestId]);

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!status) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-500">
        Loading request status…
      </div>
    );
  }

  return (
    <section
      className="space-y-3 rounded-md border border-zinc-200 bg-white p-4"
      data-testid="requester-status-panel"
    >
      <div>
        <h3 className="text-base font-semibold text-zinc-900">
          Request {status.requestCode}
        </h3>
        <p className="text-sm text-zinc-600">{status.summary}</p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Status</dt>
          <dd className="font-medium text-zinc-900" data-testid="requester-status-label">
            {status.requesterVisibleStatusSummary || status.statusLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Location</dt>
          <dd>{status.unitName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Asset</dt>
          <dd>{status.assetName ?? "Not specified"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Work Order</dt>
          <dd>
            {status.workOrderCode
              ? `${status.workOrderCode} (${status.workOrderStatus})`
              : "Not created"}
          </dd>
        </div>
      </dl>
      {status.workaroundInstruction ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          Workaround: {status.workaroundInstruction}
        </p>
      ) : null}
      {status.updates.length > 0 ? (
        <ul className="space-y-1 text-sm text-zinc-700">
          {status.updates.map((u, idx) => (
            <li key={`${u.updatedAt}-${idx}`}>
              <span className="text-zinc-500">
                {new Date(u.updatedAt).toLocaleString()} —
              </span>{" "}
              {u.updateText}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
