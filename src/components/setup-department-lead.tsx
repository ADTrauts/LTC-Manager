"use client";

import { useState, useTransition, type FormEvent } from "react";

import {
  assignDepartmentOperatorAction,
  searchOperatorOrganizationsAction,
} from "@/app/(protected)/admin/departments/[departmentId]/operator-actions";

type Lead = {
  departmentId: string;
  operatorLabel: string | null;
  facilityOperated: boolean;
  headEmployeeId: string | null;
  headName: string | null;
  invitedHeadName: string | null;
  invitedHeadEmail: string | null;
};

type Props = {
  lead: Lead;
  facilityId: string;
  facilityOrganizationId: string;
  facilityOrganizationLabel: string;
  serviceDateKey: string;
  busy: boolean;
  onSaved: () => void;
};

export function SetupDepartmentLead({
  lead,
  facilityId,
  facilityOrganizationId,
  facilityOrganizationLabel,
  serviceDateKey,
  busy,
  onSaved,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [partnerOpen, setPartnerOpen] = useState(!lead.facilityOperated);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; label: string; detail: string }>>([]);
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(null);

  function assign(organizationId: string, onFailure?: () => void) {
    setError(null);
    setNotice(null);
    const formData = new FormData();
    formData.set("departmentId", lead.departmentId);
    formData.set("organizationId", organizationId);
    formData.set("effectiveFromKey", serviceDateKey);
    formData.set("replaceFutureScheduled", "on");
    startTransition(async () => {
      const result = await assignDepartmentOperatorAction(formData);
      if (!result.ok) {
        onFailure?.();
        setError(result.message);
        return;
      }
      setNotice(result.message ?? "Operating company saved.");
      onSaved();
    });
  }

  function search() {
    setError(null);
    startTransition(async () => {
      const response = await searchOperatorOrganizationsAction(query);
      if (!response.ok) {
        setError(response.message);
        setResults([]);
        return;
      }
      setResults(response.results);
    });
  }

  function nameHead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const firstName = String(data.get("firstName") ?? "").trim();
    const lastName = String(data.get("lastName") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const response = await fetch("/api/onboarding/managers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedFacilityId: facilityId,
          emails: [email],
          departmentId: lead.departmentId,
          firstName,
          lastName,
          retry: true,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        rows?: Array<{ email: string; error?: string; named?: boolean; headName?: string; deliveryStatus?: string }>;
      } | null;
      if (!response.ok) {
        setError(body?.error ?? "Could not name the Department head.");
        return;
      }
      const row = body?.rows?.[0];
      if (row?.error) {
        setError(row.error);
        return;
      }
      if (row?.named && row.headName) setNotice(`${row.headName} is the Department head.`);
      else if (row?.deliveryStatus === "SENT") setNotice("Invitation sent. They become the Department head when they accept.");
      else if (row?.deliveryStatus === "NOT_CONFIGURED") setNotice("The invitation is saved. Email delivery is not configured here, so they cannot receive it yet.");
      else if (row?.deliveryStatus === "FAILED") setError("The invitation is saved, and the email could not be sent. Try again.");
      else setNotice("Department head saved.");
      onSaved();
    });
  }

  const headStatus = lead.headName
    ? `${lead.headName} is the Department head. They set this Department up after you finish.`
    : lead.invitedHeadName && lead.invitedHeadEmail
      ? `${lead.invitedHeadName} (${lead.invitedHeadEmail}) is invited. They become the Department head when they accept, then set this Department up.`
      : "Not named yet. They set this Department up after you finish.";

  const working = busy || pending;

  function setPartnerOperation(on: boolean) {
    setPartnerOpen(on);
    if (on || lead.facilityOperated) return;
    assign(facilityOrganizationId, () => setPartnerOpen(true));
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-900">Operating company</h3>
        <p className="text-sm text-zinc-600">
          {lead.facilityOperated
            ? `This facility runs it (${lead.operatorLabel || facilityOrganizationLabel}).`
            : `A partner runs it: ${lead.operatorLabel || "partner company"}.`}
        </p>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="partner-operation" className="text-sm font-medium text-zinc-900">A partner runs it</label>
          <button
            id="partner-operation"
            type="button"
            role="switch"
            aria-checked={partnerOpen}
            disabled={working}
            onClick={() => setPartnerOperation(!partnerOpen)}
            className={`relative h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-60 ${partnerOpen ? "border-zinc-900 bg-zinc-900" : "border-zinc-300 bg-zinc-200"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition ${partnerOpen ? "left-6" : "left-0.5"}`} />
          </button>
        </div>
        {partnerOpen ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-800">
              Partner company
              <span className="mt-1 block font-normal text-zinc-500">Search for a company that already exists. A new company is created in Vssyl Console.</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="app-input mt-2 w-full"
                placeholder="Company name"
              />
            </label>
            <button type="button" className="app-button" disabled={working || query.trim().length === 0} onClick={search}>
              Search
            </button>
            {results.length > 0 ? (
              <ul className="divide-y rounded border border-zinc-200">
                {results.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-zinc-50"
                      onClick={() => setSelected({ id: row.id, label: row.label })}
                    >
                      <span className="text-sm font-medium">{row.label}</span>
                      {row.detail ? <span className="text-xs text-zinc-500">{row.detail}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {selected ? <p className="text-sm">Selected: {selected.label}</p> : null}
            <button type="button" className="app-button app-accent-button text-white" disabled={working || !selected} onClick={() => selected && assign(selected.id)}>
              Save partner
            </button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-900">Department head</h3>
        <p className="text-sm text-zinc-600">{headStatus}</p>
        {lead.headName && lead.invitedHeadName && lead.invitedHeadEmail ? (
          <p className="text-sm text-zinc-600">{lead.invitedHeadName} ({lead.invitedHeadEmail}) is invited. They become the Department head when they accept.</p>
        ) : null}
        <form onSubmit={nameHead} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-zinc-800">
            First name
            <input name="firstName" required autoComplete="given-name" className="app-input mt-1 w-full font-normal" />
          </label>
          <label className="block text-sm font-medium text-zinc-800">
            Last name
            <input name="lastName" required autoComplete="family-name" className="app-input mt-1 w-full font-normal" />
          </label>
          <label className="block text-sm font-medium text-zinc-800 sm:col-span-2">
            Email
            <input type="email" name="email" required autoComplete="email" placeholder="name@example.com" className="app-input mt-1 w-full font-normal" />
          </label>
          <button
            type="submit"
            className="inline-flex min-h-10 w-fit items-center justify-center rounded-md border border-zinc-900 bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 sm:col-span-2"
            disabled={working}
          >
            Name and invite
          </button>
        </form>
      </section>

      {error ? <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-zinc-700">{notice}</p> : null}
    </div>
  );
}
