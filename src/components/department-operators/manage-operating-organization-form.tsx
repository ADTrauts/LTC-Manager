"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  assignDepartmentOperatorAction,
  searchOperatorOrganizationsAction,
} from "@/app/(protected)/admin/departments/[departmentId]/operator-actions";

type SearchResult = { id: string; label: string; detail: string };

type Props = {
  departmentId: string;
  facilityOrganizationId: string;
  facilityOrganizationLabel: string;
  defaultEffectiveFromKey: string;
  currentOrganizationId: string | null;
  currentOrganizationLabel: string | null;
};

export function ManageOperatingOrganizationForm({
  departmentId,
  facilityOrganizationId,
  facilityOrganizationLabel,
  defaultEffectiveFromKey,
  currentOrganizationId,
  currentOrganizationLabel,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    currentOrganizationId ?? facilityOrganizationId,
  );
  const [selectedLabel, setSelectedLabel] = useState<string>(
    currentOrganizationLabel ?? facilityOrganizationLabel,
  );
  const [searched, setSearched] = useState(false);

  async function runSearch() {
    setError(null);
    const response = await searchOperatorOrganizationsAction(query);
    if (!response.ok) {
      setError(response.message);
      setResults([]);
      return;
    }
    setResults(response.results);
    setSearched(true);
  }

  function onAssignExisting(formData: FormData) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await assignDepartmentOperatorAction(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message ?? "Saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5" data-testid="manage-operating-organization-form">
      <form action={onAssignExisting} className="space-y-3">
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="organizationId" value={selectedId ?? ""} />
          <input type="hidden" name="replaceFutureScheduled" value="on" />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-700">Search organizations</label>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="app-input w-full"
                placeholder="Metz, Sodexo, ECMC…"
                data-testid="operator-org-search"
              />
              <button
                type="button"
                onClick={() => void runSearch()}
                className="rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800"
              >
                Search
              </button>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-zinc-700 underline underline-offset-2"
              onClick={() => {
                setSelectedId(facilityOrganizationId);
                setSelectedLabel(facilityOrganizationLabel);
              }}
              data-testid="use-facility-organization"
            >
              Use facility parent organization ({facilityOrganizationLabel})
            </button>
            {results.length > 0 ? (
              <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
                {results.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-zinc-50"
                      onClick={() => {
                        setSelectedId(row.id);
                        setSelectedLabel(row.label);
                      }}
                      data-testid={`operator-org-result-${row.id}`}
                    >
                      <span className="text-sm font-medium text-zinc-900">{row.label}</span>
                      {row.detail ? (
                        <span className="text-xs text-zinc-500">{row.detail}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : searched ? (
              <p className="text-sm text-amber-800" data-testid="operator-org-missing">
                No matching company. Vssyl Console must create it before this facility can attach it.
              </p>
            ) : null}
            {selectedId ? (
              <p className="text-sm text-zinc-700" data-testid="selected-operator-org">
                Selected: <span className="font-medium">{selectedLabel || selectedId}</span>
              </p>
            ) : (
              <p className="text-sm text-amber-800">Select an organization to continue.</p>
            )}
          </div>

          <DateAndMetaFields defaultEffectiveFromKey={defaultEffectiveFromKey} />

          <button
            type="submit"
            disabled={pending || !selectedId}
            className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white disabled:opacity-50"
            data-testid="save-operating-organization"
          >
            {pending ? "Saving…" : "Save operating organization"}
          </button>
      </form>

      {error ? (
        <p className="text-sm text-red-700" data-testid="operator-action-error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-emerald-800" data-testid="operator-action-message">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function DateAndMetaFields({ defaultEffectiveFromKey }: { defaultEffectiveFromKey: string }) {
  return (
    <>
      <div className="space-y-2">
        <label htmlFor="effectiveFromKey" className="block text-sm font-medium text-zinc-700">
          Effective date
        </label>
        <input
          id="effectiveFromKey"
          name="effectiveFromKey"
          type="date"
          required
          defaultValue={defaultEffectiveFromKey}
          className="app-input w-full max-w-xs"
          data-testid="operator-effective-from"
        />
        <p className="text-xs text-zinc-500">
          Future dates schedule the change. The current operator stays until the day before.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="externalAccountCode" className="block text-sm font-medium text-zinc-700">
          Account code (optional)
        </label>
        <input
          id="externalAccountCode"
          name="externalAccountCode"
          className="app-input w-full"
          maxLength={120}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="contractReference" className="block text-sm font-medium text-zinc-700">
          Contract reference (optional)
        </label>
        <input
          id="contractReference"
          name="contractReference"
          className="app-input w-full"
          maxLength={200}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="notes" className="block text-sm font-medium text-zinc-700">
          Notes (optional)
        </label>
        <textarea id="notes" name="notes" rows={2} className="app-input w-full" maxLength={500} />
      </div>
    </>
  );
}
