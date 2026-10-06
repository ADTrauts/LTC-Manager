"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  acceptRequestCreateIssueAction,
  acceptRequestCreateIssueAndWorkOrderAction,
  declineOperationalRequestAction,
  linkRequestToExistingIssueAction,
  resolveRequestWithoutWorkAction,
  searchOpenIssuesForTriageAction,
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
  description?: string;
  requesterLabel?: string | null;
  spaceName?: string | null;
  assetName?: string | null;
  projectedStatus?: string;
  projectedStatusLabel?: string;
  issueCode?: string | null;
  issueId?: string | null;
  workOrderStatus?: string | null;
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

type IssueLookup = {
  id: string;
  issueCode: string;
  summary: string;
  status: string;
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
  const [reason, setReason] = useState("");
  const [issueQuery, setIssueQuery] = useState("");
  const [issueMatches, setIssueMatches] = useState<IssueLookup[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState("");

  const selected = requests.find((r) => r.id === selectedId) ?? null;
  const alreadyLinked = Boolean(selected?.issueId);

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setReason("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  const summaryCards = useMemo(
    () => [
      ["New", summary.newRequests],
      ["Untriaged", summary.untriaged],
      ["Urgent", summary.urgent],
      ["Open WO", summary.openWorkOrders],
      ["In progress", summary.inProgressWorkOrders],
      ["On hold", summary.waitingVendor + summary.waitingParts],
      ["Unassigned WO", summary.unassignedWorkOrders],
      ["OOS assets", summary.outOfServiceAssets],
    ],
    [summary],
  );

  return (
    <section
      className="space-y-4 rounded-md border border-zinc-200 bg-white p-4"
      data-testid="plant-triage-panel"
    >
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Requests needing triage</h2>
        <p className="text-sm text-zinc-600">
          Accept and create an Issue, link a duplicate, or resolve without work. A Work Order is a
          separate record.
        </p>
      </div>

      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4"
        data-testid="plant-triage-summary"
      >
        {summaryCards.map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-zinc-200 px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
            <div className="text-lg font-semibold text-zinc-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ul className="max-h-96 space-y-2 overflow-auto" data-testid="plant-triage-request-list">
          {requests.length === 0 ? (
            <li className="text-sm text-zinc-500">No Requests needing attention.</li>
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
                    {r.requestingDepartmentName} · {r.unitName}
                    {r.spaceName ? ` · ${r.spaceName}` : ""}
                    {r.assetName ? ` · ${r.assetName}` : ""}
                    {" · "}
                    {r.projectedStatusLabel ?? "Received"}
                    {r.issueCode ? ` · Issue ${r.issueCode}` : ""}
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
                  {selected.requesterLabel ? `${selected.requesterLabel} · ` : ""}
                  {selected.requestingDepartmentName} · {selected.unitName}
                  {selected.spaceName ? ` · ${selected.spaceName}` : ""}
                  {selected.assetName ? ` · ${selected.assetName}` : " · No Asset"}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
                  {selected.description || selected.summary}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Requester status: {selected.projectedStatusLabel ?? "Received"}
                  {selected.issueCode ? ` · Linked Issue ${selected.issueCode}` : " · No Issue yet"}
                  {selected.workOrderCode
                    ? ` · Work Order ${selected.workOrderCode}`
                    : " · No Work Order yet"}
                </p>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Internal note
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
                  disabled={pending || alreadyLinked}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() =>
                    run(async () => {
                      const fd = new FormData();
                      fd.set("plantDepartmentId", plantDepartmentId);
                      fd.set("requestId", selected.id);
                      fd.set("triageNote", triageNote);
                      await acceptRequestCreateIssueAction(fd);
                    })
                  }
                  data-testid="plant-accept-issue"
                >
                  Accept + create Issue
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
                      fd.set("triageNote", triageNote);
                      if (assigneeId) fd.set("assignedEmployeeId", assigneeId);
                      await acceptRequestCreateIssueAndWorkOrderAction(fd);
                    })
                  }
                  data-testid="plant-create-wo"
                >
                  Accept + Issue + Work Order
                </button>
              </div>

              <div className="space-y-2 rounded-md border border-zinc-200 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Link existing Issue
                </p>
                <div className="flex gap-2">
                  <input
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    placeholder="Search open Issues"
                    value={issueQuery}
                    onChange={(e) => setIssueQuery(e.target.value)}
                    data-testid="plant-issue-search"
                  />
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    onClick={() =>
                      run(async () => {
                        const rows = await searchOpenIssuesForTriageAction({
                          plantDepartmentId,
                          q: issueQuery,
                        });
                        setIssueMatches(
                          rows.map((row) => ({
                            id: row.id,
                            issueCode: row.issueCode,
                            summary: row.summary,
                            status: row.status,
                          })),
                        );
                      })
                    }
                    data-testid="plant-issue-search-submit"
                  >
                    Search
                  </button>
                </div>
                {issueMatches.length > 0 ? (
                  <select
                    className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                    value={selectedIssueId}
                    onChange={(e) => setSelectedIssueId(e.target.value)}
                    data-testid="plant-issue-lookup"
                  >
                    <option value="">Select Issue</option>
                    {issueMatches.map((issue) => (
                      <option key={issue.id} value={issue.id}>
                        {issue.issueCode} · {issue.summary}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  disabled={pending || !selectedIssueId}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() =>
                    run(async () => {
                      const fd = new FormData();
                      fd.set("plantDepartmentId", plantDepartmentId);
                      fd.set("requestId", selected.id);
                      fd.set("issueId", selectedIssueId);
                      fd.set("triageNote", triageNote);
                      await linkRequestToExistingIssueAction(fd);
                    })
                  }
                  data-testid="plant-link-issue"
                >
                  Link to selected Issue
                </button>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Reason for decline / resolve without work
                </span>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Required"
                  data-testid="plant-triage-reason"
                />
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
                      fd.set("reason", reason);
                      await declineOperationalRequestAction(fd);
                    })
                  }
                  data-testid="plant-decline"
                >
                  Decline
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
                      fd.set("reason", reason);
                      await resolveRequestWithoutWorkAction(fd);
                    })
                  }
                  data-testid="plant-resolve-without-work"
                >
                  Resolve without work
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Select a Request.</p>
          )}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
