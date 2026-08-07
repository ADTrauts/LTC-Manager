"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  createOperationalRequestAction,
  listRequestRoutesAction,
} from "@/app/(protected)/operational-requests/actions";

export type ReportProblemRouteOption = {
  responsibleDepartmentId: string;
  responsibleDepartmentName: string;
  responsibleDepartmentKey: string;
};

export type ReportProblemAssetOption = {
  id: string;
  name: string;
  assetCode: string;
};

type Props = {
  facilityId: string;
  requestingDepartmentId: string;
  unitId: string;
  spaceId?: string | null;
  assets?: ReportProblemAssetOption[];
  compact?: boolean;
};

const IMPACT_OPTIONS = [
  { value: "NO_IMMEDIATE_IMPACT", label: "No immediate service impact" },
  { value: "WORKAROUND_AVAILABLE", label: "Workaround available" },
  { value: "SERVICE_AT_RISK", label: "Service at risk" },
  { value: "EQUIPMENT_UNAVAILABLE", label: "Equipment unavailable" },
] as const;

function nowLocalInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Shared Report a Problem form for Dietary / EVS / Plant when flags allow.
 * Destination is limited to configured DepartmentRequestRoute rows.
 */
export function ReportProblemForm({
  facilityId,
  requestingDepartmentId,
  unitId,
  spaceId = null,
  assets = [],
  compact = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [routes, setRoutes] = useState<ReportProblemRouteOption[]>([]);
  const [responsibleDepartmentId, setResponsibleDepartmentId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [observedAt, setObservedAt] = useState(nowLocalInputValue);
  const [impact, setImpact] = useState<(typeof IMPACT_OPTIONS)[number]["value"]>(
    "NO_IMMEDIATE_IMPACT",
  );
  const [priority, setPriority] = useState("MEDIUM");
  const [usable, setUsable] = useState(true);
  const [workaround, setWorkaround] = useState("");
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listRequestRoutesAction(requestingDepartmentId)
      .then((rows) => {
        if (cancelled) return;
        const mapped = rows.map((r) => ({
          responsibleDepartmentId: r.responsibleDepartmentId,
          responsibleDepartmentName: r.responsibleDepartment.name,
          responsibleDepartmentKey: r.responsibleDepartment.key,
        }));
        setRoutes(mapped);
        if (mapped.length === 1) {
          setResponsibleDepartmentId(mapped[0]!.responsibleDepartmentId);
        }
      })
      .catch(() => {
        if (!cancelled) setRoutes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [requestingDepartmentId]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const fd = new FormData();
    fd.set("facilityId", facilityId);
    fd.set("requestingDepartmentId", requestingDepartmentId);
    fd.set("responsibleDepartmentId", responsibleDepartmentId);
    fd.set("unitId", unitId);
    if (spaceId) fd.set("spaceId", spaceId);
    if (assetId) fd.set("assetId", assetId);
    fd.set("summary", summary);
    fd.set("description", description || summary);
    fd.set("observedAt", observedAt);
    fd.set("operationalImpact", impact);
    fd.set("priority", priority);
    fd.set("equipmentRemainsUsable", usable ? "true" : "false");
    if (workaround.trim()) fd.set("workaroundInstruction", workaround.trim());
    if (allowDuplicate) fd.set("allowObviousDuplicate", "1");

    startTransition(async () => {
      try {
        const result = await createOperationalRequestAction(fd);
        setNotice(`Request ${result.requestCode} reported.`);
        setSummary("");
        setDescription("");
        setWorkaround("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to report problem.");
      }
    });
  }

  if (routes.length === 0) {
    return (
      <div
        className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600"
        data-testid="report-problem-no-routes"
      >
        No request destinations are configured for this department.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`space-y-3 rounded-md border border-zinc-200 bg-white p-4 ${compact ? "text-sm" : ""}`}
      data-testid="report-problem-form"
    >
      <h3 className="text-base font-semibold text-zinc-900">Report a problem</h3>
      <p className="text-sm text-zinc-600">
        Send a request to a configured responsible department. Work Orders are not created
        automatically.
      </p>

      {routes.length > 1 ? (
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Send to
          </span>
          <select
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            value={responsibleDepartmentId}
            onChange={(e) => setResponsibleDepartmentId(e.target.value)}
            required
            data-testid="report-problem-destination"
          >
            <option value="">Select destination</option>
            {routes.map((r) => (
              <option key={r.responsibleDepartmentId} value={r.responsibleDepartmentId}>
                {r.responsibleDepartmentName}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" value={responsibleDepartmentId} readOnly />
      )}

      {assets.length > 0 ? (
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Asset (optional)
          </span>
          <select
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            data-testid="report-problem-asset"
          >
            <option value="">No specific asset</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.assetCode})
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Summary</span>
        <input
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          required
          data-testid="report-problem-summary"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Description
        </span>
        <textarea
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          data-testid="report-problem-description"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Observed at
          </span>
          <input
            type="datetime-local"
            className="w-full rounded-md border border-zinc-300 px-3 py-2"
            value={observedAt}
            onChange={(e) => setObservedAt(e.target.value)}
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Priority
          </span>
          <select
            className="w-full rounded-md border border-zinc-300 px-3 py-2"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Operational impact
        </span>
        <select
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          value={impact}
          onChange={(e) =>
            setImpact(e.target.value as (typeof IMPACT_OPTIONS)[number]["value"])
          }
        >
          {IMPACT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {assetId ? (
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={usable}
            onChange={(e) => setUsable(e.target.checked)}
          />
          Equipment remains usable
        </label>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Workaround (visible to requester)
        </span>
        <input
          className="w-full rounded-md border border-zinc-300 px-3 py-2"
          value={workaround}
          onChange={(e) => setWorkaround(e.target.value)}
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={allowDuplicate}
          onChange={(e) => setAllowDuplicate(e.target.checked)}
        />
        Confirm if this may duplicate an open request
      </label>

      {error ? (
        <p className="text-sm text-red-700" data-testid="report-problem-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-sm text-emerald-700" data-testid="report-problem-notice">
          {notice}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !responsibleDepartmentId}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        data-testid="report-problem-submit"
      >
        {pending ? "Submitting…" : "Report problem"}
      </button>
    </form>
  );
}
