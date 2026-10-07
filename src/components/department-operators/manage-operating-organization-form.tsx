"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  assignDepartmentOperatorAction,
  createOrganizationAndAssignOperatorAction,
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
  const [createName, setCreateName] = useState("");
  const [mode, setMode] = useState<"existing" | "create">("existing");

  async function runSearch() {
    setError(null);
    const response = await searchOperatorOrganizationsAction(query);
    if (!response.ok) {
      setError(response.message);
      setResults([]);
      return;
    }
    setResults(response.results);
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

  function onCreateAndAssign(formData: FormData) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await createOrganizationAndAssignOperatorAction(formData);
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

      {mode === "existing" ? (
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
      ) : (
        <form action={onCreateAndAssign} className="space-y-3">
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="replaceFutureScheduled" value="on" />

          <div className="space-y-2">
            <label htmlFor="organizationName" className="block text-sm font-medium text-zinc-700">
              New organization name
            </label>
            <input
              id="organizationName"
              name="organizationName"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              className="app-input w-full"
              maxLength={200}
              required
              placeholder="Metz Culinary Management"
              data-testid="create-operator-org-name"
            />
            <p className="text-xs text-zinc-500">
              Creates a platform Organization record for operator identity only. It does not grant
              users from that Organization access to this facility.
            </p>
          </div>

          <DateAndMetaFields defaultEffectiveFromKey={defaultEffectiveFromKey} />

          <button
            type="submit"
            disabled={pending || createName.trim().length < 2}
            className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-semibold text-white disabled:opacity-50"
            data-testid="create-and-assign-operating-organization"
          >
            {pending ? "Saving…" : "Create and assign"}
          </button>
        </form>
      )}

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
