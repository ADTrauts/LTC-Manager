"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  acknowledgeOperationalRequestAction,
  createWorkOrderFromRequestAction,
  triageOperationalRequestAction,
} from "@/app/(protected)/operational-requests/actions";

export type PlantTriageRequestRow = {
  id: string;
  requestCode: string;
  summary: string;
  status: string;
  priority: string;
  requestingDepartmentName: string;
  unitName: string;
  reportedAt: string;
  workOrderCode: string | null;
};

type Props = {
  plantDepartmentId: string;
  requests: PlantTriageRequestRow[];
  technicians: Array<{ id: string; name: string }>;
  summary: {
    newRequests: number;
    untriaged: number;
    urgent: number;
    openWorkOrders: number;
    inProgressWorkOrders: number;
    waitingVendor: number;
    waitingParts: number;
    overdueWorkOrders: number;
    unassignedWorkOrders: number;
    outOfServiceAssets: number;
  };
};

export function PlantTriagePanel({
  plantDepartmentId,
  requests,
  technicians,
  summary,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(requests[0]?.id ?? "");
  const [assigneeId, setAssigneeId] = useState("");
  const [triageNote, setTriageNote] = useState("");

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <section
      className="space-y-4 rounded-md border border-zinc-200 bg-white p-4"
      data-testid="plant-triage-panel"
    >
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Plant request triage</h2>
        <p className="text-sm text-zinc-600">
          New and open requests routed to Plant. Creating a Work Order is explicit.
        </p>
      </div>

      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5"
        data-testid="plant-triage-summary"
      >
        {[
          ["New", summary.newRequests],
          ["Untriaged", summary.untriaged],
          ["Urgent", summary.urgent],
          ["Open WO", summary.openWorkOrders],
          ["In progress", summary.inProgressWorkOrders],
          ["Waiting vendor", summary.waitingVendor],
          ["Waiting parts", summary.waitingParts],
          ["Overdue WO", summary.overdueWorkOrders],
          ["Unassigned WO", summary.unassignedWorkOrders],
          ["OOS assets", summary.outOfServiceAssets],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-zinc-200 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
            <div className="text-lg font-semibold text-zinc-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ul className="max-h-80 space-y-2 overflow-auto" data-testid="plant-triage-request-list">
          {requests.length === 0 ? (
            <li className="text-sm text-zinc-500">No open Plant requests.</li>
          ) : (
            requests.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left ${
                    selectedId === r.id
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-200 bg-white"
                  }`}
                  data-testid={`plant-request-${r.requestCode}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-900">{r.requestCode}</span>
                    <span className="text-xs text-zinc-500">{r.priority}</span>
                  </div>
                  <div className="text-sm text-zinc-700">{r.summary}</div>
                  <div className="text-xs text-zinc-500">
                    {r.requestingDepartmentName} · {r.unitName} · {r.status}
                    {r.workOrderCode ? ` · WO ${r.workOrderCode}` : ""}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="space-y-3" data-testid="plant-triage-detail">
          {selected ? (
            <>
              <div>
                <div className="text-sm font-semibold text-zinc-900">
                  {selected.requestCode} — {selected.summary}
                </div>
                <div className="text-xs text-zinc-500">
                  Status {selected.status} · {selected.requestingDepartmentName}
                </div>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Internal triage note
                </span>
                <textarea
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  rows={2}
                  value={triageNote}
                  onChange={(e) => setTriageNote(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Assign technician (optional)
                </span>
                <select
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  data-testid="plant-triage-assignee"
                >
                  <option value="">Unassigned</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  onClick={() =>
                    run(async () => {
                      const fd = new FormData();
                      fd.set("plantDepartmentId", plantDepartmentId);
                      fd.set("requestId", selected.id);
                      await acknowledgeOperationalRequestAction(fd);
                    })
                  }
                  data-testid="plant-acknowledge"
                >
                  Acknowledge
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  onClick={() =>
                    run(async () => {
                      const fd = new FormData();
                      fd.set("plantDepartmentId", plantDepartmentId);
                      fd.set("requestId", selected.id);
                      fd.set("triageNote", triageNote);
                      await triageOperationalRequestAction(fd);
                    })
                  }
                  data-testid="plant-triage"
                >
                  Triage
                </button>
                <button
                  type="button"
                  disabled={pending || Boolean(selected.workOrderCode)}
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() =>
                    run(async () => {
                      const fd = new FormData();
                      fd.set("plantDepartmentId", plantDepartmentId);
                      fd.set("requestId", selected.id);
                      if (assigneeId) fd.set("assignedEmployeeId", assigneeId);
                      await createWorkOrderFromRequestAction(fd);
                    })
                  }
                  data-testid="plant-create-wo"
                >
                  Create Work Order
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Select a request.</p>
          )}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
