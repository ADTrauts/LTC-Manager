"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createFacilityPartnerAction,
  createOrganizationAndPartnerAction,
  searchPartnerOrganizationsAction,
} from "@/app/(protected)/admin/organization/partners/actions";

type SearchResult = { id: string; label: string; detail: string };

type Props = {
  facilityOrganizationId: string;
  facilityOrganizationLabel: string;
};

export function CreateFacilityPartnerForm({
  facilityOrganizationId,
  facilityOrganizationLabel,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  const [createName, setCreateName] = useState("");
  const [mode, setMode] = useState<"existing" | "create">("existing");

  async function runSearch() {
    setError(null);
    const response = await searchPartnerOrganizationsAction(query);
    if (!response.ok) {
      setError(response.message);
      setResults([]);
      return;
    }
    setResults(response.results);
  }

  function onCreateExisting(formData: FormData) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await createFacilityPartnerAction(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message ?? "Saved.");
      if (result.partnershipId) {
        router.push(`/admin/organization/partners/${result.partnershipId}`);
        return;
      }
      router.refresh();
    });
  }

  function onCreateNewOrg(formData: FormData) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await createOrganizationAndPartnerAction(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message ?? "Saved.");
      if (result.partnershipId) {
        router.push(`/admin/organization/partners/${result.partnershipId}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4" data-testid="create-facility-partner-form">
      <div className="flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          className={
            mode === "existing"
              ? "rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white"
              : "rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700"
          }
          onClick={() => setMode("existing")}
        >
          Select existing
        </button>
        <button
          type="button"
          className={
            mode === "create"
              ? "rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white"
              : "rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700"
          }
          onClick={() => setMode("create")}
        >
          Create organization
        </button>
      </div>

      <p className="text-xs text-zinc-500">
        Your parent Organization ({facilityOrganizationLabel}) cannot be selected as an external
        partner. Establishing a partnership does not grant any partner users access to this
        Facility.
      </p>

      {mode === "existing" ? (
        <form action={onCreateExisting} className="space-y-3">
          <input type="hidden" name="organizationId" value={selectedId ?? ""} />
          <input type="hidden" name="facilityOrganizationId" value={facilityOrganizationId} />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-700">Search organizations</label>
            <div className="flex gap-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                placeholder="Metz Culinary Management"
              />
              <button
                type="button"
                onClick={() => void runSearch()}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800"
              >
                Search
              </button>
            </div>
            {results.length > 0 ? (
              <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
                {results.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left text-sm ${
                        selectedId === row.id ? "bg-zinc-100" : "hover:bg-zinc-50"
                      }`}
                      onClick={() => {
                        setSelectedId(row.id);
                        setSelectedLabel(row.label);
                      }}
                    >
                      <span className="font-medium text-zinc-900">{row.label}</span>
                      {row.detail ? (
                        <span className="mt-0.5 block text-xs text-zinc-500">{row.detail}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {selectedId ? (
              <p className="text-sm text-zinc-700">
                Selected: <span className="font-medium">{selectedLabel}</span>
              </p>
            ) : (
              <p className="text-sm text-zinc-500">Select an organization from search results.</p>
            )}
          </div>

          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Notes (optional)</span>
            <textarea
              name="notes"
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" name="activateNow" />
            Activate authorization now
          </label>

          <button
            type="submit"
            disabled={pending || !selectedId}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Establish partner"}
          </button>
        </form>
      ) : (
        <form action={onCreateNewOrg} className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">New organization name</span>
            <input
              name="organizationName"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Metz Culinary Management"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Notes (optional)</span>
            <textarea
              name="notes"
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" name="activateNow" />
            Activate authorization now
          </label>
          <button
            type="submit"
            disabled={pending || createName.trim().length < 2}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Create organization & partner"}
          </button>
        </form>
      )}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-800">{message}</p> : null}
    </div>
  );
}
