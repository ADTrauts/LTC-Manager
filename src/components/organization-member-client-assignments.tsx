"use client";

import { useMemo, useState, useTransition } from "react";

import {
  assignOrganizationClientAction,
  changeOrganizationClientRoleAction,
  endOrganizationClientAccessAction,
  loadOrganizationMemberClientAssignmentsAction,
} from "@/app/(organization-account)/organization/client-staffing-actions";
import {
  partnerRoleLabel,
  partnerRolesAtOrBelow,
} from "@/lib/partner-user-access/roles";
import type {
  OrganizationMemberClientAssignment,
  OrganizationMemberClientAssignments,
} from "@/lib/partner-user-access/organization-member-clients";

type Filter = "all" | "assigned" | "unassigned";

export function OrganizationMemberClientAssignments({
  targetUserId,
  displayName,
}: {
  targetUserId: string;
  displayName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OrganizationMemberClientAssignments | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const panelId = `client-assignments-${targetUserId}`;

  function load() {
    setError(null);
    startTransition(async () => {
      const result = await loadOrganizationMemberClientAssignmentsAction({ targetUserId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setData(result.data);
    });
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data === null) load();
  }

  function run(action: (formData: FormData) => Promise<{ ok: boolean; message?: string }>, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.message ?? "Staffing could not be updated.");
        return;
      }
      const refreshed = await loadOrganizationMemberClientAssignmentsAction({ targetUserId });
      if (!refreshed.ok) {
        setError(refreshed.message);
        return;
      }
      setData(refreshed.data);
    });
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.clients ?? []).filter((client) => {
      if (filter === "assigned" && !client.currentAssignment) return false;
      if (filter === "unassigned" && client.currentAssignment) return false;
      if (!needle) return true;
      return client.facilityDisplayName.toLowerCase().includes(needle);
    });
  }, [data, filter, query]);

  return (
    <div className="mt-3 w-full" data-testid={`member-client-assignments-${targetUserId}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium"
      >
        Manage client assignments
      </button>
      {open ? (
        <div id={panelId} className="mt-3 rounded-md border border-zinc-100 bg-zinc-50 px-3 py-3">
          <h3 className="text-sm font-semibold text-zinc-900">Client assignments</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Assign {displayName} to current client facilities where this organization may manage staffing.
          </p>
          {error ? (
            <p className="mt-2 text-sm text-red-700" role="alert" data-testid="member-client-assignments-error">
              {error}
            </p>
          ) : null}
          {data ? (
            <>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                <label className="min-w-0 flex-1 text-sm">
                  <span className="sr-only">Search facilities</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search facilities..."
                    className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                  />
                </label>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Filter client assignments">
                  {(
                    [
                      ["all", "All"],
                      ["assigned", "Assigned"],
                      ["unassigned", "Not assigned"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                      className={
                        filter === value
                          ? "rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white"
                          : "rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium"
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {visible.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600">
                  {data.clients.length === 0
                    ? "No current client facilities are connected to this organization."
                    : "No client facilities match this filter."}
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-zinc-200">
                  {visible.map((client) => (
                    <MemberClientRow
                      key={client.facilityPartnerOrganizationId}
                      client={client}
                      targetUserId={targetUserId}
                      displayName={displayName}
                      pending={pending}
                      run={run}
                    />
                  ))}
                </ul>
              )}
            </>
          ) : pending ? (
            <p className="mt-2 text-sm text-zinc-500">Loading client assignments…</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MemberClientRow({
  client,
  targetUserId,
  displayName,
  pending,
  run,
}: {
  client: OrganizationMemberClientAssignment;
  targetUserId: string;
  displayName: string;
  pending: boolean;
  run: (action: (formData: FormData) => Promise<{ ok: boolean; message?: string }>, formData: FormData) => void;
}) {
  const roleChoices = client.roleCeiling ? partnerRolesAtOrBelow(client.roleCeiling) : [];
  const assigned = client.currentAssignment;
  return (
    <li className="py-3" data-testid={`member-client-${client.facilityId}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">{client.facilityDisplayName}</p>
          {client.departmentNames.length > 0 ? (
            <p className="text-xs text-zinc-500">{client.departmentNames.join(", ")}</p>
          ) : null}
          <p className="mt-1 text-sm text-zinc-700">
            {assigned ? `Assigned · ${partnerRoleLabel(assigned.partnerRole)}` : "Not assigned"}
          </p>
          {client.unavailableReason ? (
            <p className="mt-1 text-xs text-zinc-500">{client.unavailableReason}</p>
          ) : null}
        </div>
        {assigned && client.canManageAssignment ? (
          <div className="flex flex-col gap-2 sm:items-end">
            <form
              className="flex flex-wrap items-center gap-2"
              action={(formData) => run(changeOrganizationClientRoleAction, formData)}
            >
              <input type="hidden" name="facilityPartnerOrganizationId" value={client.facilityPartnerOrganizationId} />
              <input type="hidden" name="targetUserId" value={targetUserId} />
              <label className="sr-only" htmlFor={`member-role-${client.facilityId}-${targetUserId}`}>
                Partner role for {displayName} at {client.facilityDisplayName}
              </label>
              <select
                id={`member-role-${client.facilityId}-${targetUserId}`}
                name="partnerRole"
                defaultValue={assigned.partnerRole}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
              >
                {roleChoices.map((role) => (
                  <option key={role} value={role}>
                    {partnerRoleLabel(role)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-medium"
              >
                Change role
              </button>
            </form>
            <form action={(formData) => run(endOrganizationClientAccessAction, formData)}>
              <input type="hidden" name="facilityPartnerOrganizationId" value={client.facilityPartnerOrganizationId} />
              <input type="hidden" name="targetUserId" value={targetUserId} />
              <button
                type="submit"
                disabled={pending}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-medium"
              >
                End access
              </button>
            </form>
          </div>
        ) : null}
        {client.assignable ? (
          <form
            className="flex flex-wrap items-end gap-2"
            action={(formData) => run(assignOrganizationClientAction, formData)}
          >
            <input type="hidden" name="facilityPartnerOrganizationId" value={client.facilityPartnerOrganizationId} />
            <input type="hidden" name="targetUserId" value={targetUserId} />
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-zinc-600">
                Partner role at {client.facilityDisplayName}
              </span>
              <select name="partnerRole" className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm" required>
                {roleChoices.map((role) => (
                  <option key={role} value={role}>
                    {partnerRoleLabel(role)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
            >
              Assign
            </button>
          </form>
        ) : null}
      </div>
    </li>
  );
}
