"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { upsertRequestRouteAction } from "@/app/(protected)/operational-requests/actions";

export type RequestRouteRow = {
  id: string;
  requestingDepartmentId: string;
  requestingDepartmentName: string;
  requestingDepartmentKey: string;
  responsibleDepartmentId: string;
  responsibleDepartmentName: string;
  responsibleDepartmentKey: string;
  isActive: boolean;
  sortOrder: number;
  note: string | null;
};

type DepartmentOption = {
  id: string;
  name: string;
  key: string;
};

type Props = {
  plantDepartmentId: string;
  routes: RequestRouteRow[];
  departments: DepartmentOption[];
};

/**
 * Minimal Plant Manager routing configuration.
 * Allowed requesting → responsible destinations only — no rules engine.
 */
export function PlantRequestRoutingPanel({
  plantDepartmentId,
  routes,
  departments,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState(
    departments.find((d) => d.key === "DIETARY")?.id ?? departments[0]?.id ?? "",
  );
  const [responsibleId, setResponsibleId] = useState(plantDepartmentId);
  const [note, setNote] = useState("");

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("plantDepartmentId", plantDepartmentId);
        fd.set("requestingDepartmentId", requestingId);
        fd.set("responsibleDepartmentId", responsibleId);
        fd.set("isActive", "1");
        fd.set("sortOrder", "100");
        if (note.trim()) fd.set("note", note.trim());
        await upsertRequestRouteAction(fd);
        setNote("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save route.");
      }
    });
  }

  return (
    <section
      className="space-y-3 rounded-md border border-zinc-200 bg-white p-4"
      data-testid="plant-request-routing-panel"
    >
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Request routing</h2>
        <p className="text-sm text-zinc-600">
          Configure which departments may send service requests to a responsible
          department. Destinations are explicit — Plant is not assumed.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm" data-testid="plant-request-routing-table">
          <thead className="border-b border-zinc-200 text-zinc-600">
            <tr>
              <th className="py-2 pr-3 font-medium">From</th>
              <th className="py-2 pr-3 font-medium">To</th>
              <th className="py-2 pr-3 font-medium">Active</th>
              <th className="py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {routes.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-3 text-zinc-500">
                  No routes configured yet.
                </td>
              </tr>
            ) : (
              routes.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-3">
                    {r.requestingDepartmentName}{" "}
                    <span className="text-zinc-500">({r.requestingDepartmentKey})</span>
                  </td>
                  <td className="py-2 pr-3">
                    {r.responsibleDepartmentName}{" "}
                    <span className="text-zinc-500">({r.responsibleDepartmentKey})</span>
                  </td>
                  <td className="py-2 pr-3">{r.isActive ? "Yes" : "No"}</td>
                  <td className="py-2 text-zinc-600">{r.note ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-700">Requesting department</span>
          <select
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5"
            value={requestingId}
            onChange={(e) => setRequestingId(e.target.value)}
            data-testid="plant-route-requesting"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-700">Responsible department</span>
          <select
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5"
            value={responsibleId}
            onChange={(e) => setResponsibleId(e.target.value)}
            data-testid="plant-route-responsible"
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-zinc-700">Note (optional)</span>
          <input
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Dietary kitchen equipment → Plant"
            data-testid="plant-route-note"
          />
        </label>
      </div>

      <button
        type="button"
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        disabled={pending || !requestingId || !responsibleId}
        onClick={save}
        data-testid="plant-route-save"
      >
        {pending ? "Saving…" : "Save route"}
      </button>
    </section>
  );
}
