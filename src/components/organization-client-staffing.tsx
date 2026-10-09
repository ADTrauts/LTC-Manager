"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { OrganizationPartnerRole } from "@prisma/client";

import {
  assignOrganizationClientAction,
  changeOrganizationClientRoleAction,
  endOrganizationClientAccessAction,
} from "@/app/(organization-account)/organization/client-staffing-actions";
import { organizationMembershipRoleLabel } from "@/lib/organization-membership";
import {
  partnerRoleLabel,
  partnerRolesAtOrBelow,
  type OrganizationClientStaffing,
} from "@/lib/partner-user-access";

function choiceLabel(role: OrganizationPartnerRole) {
  switch (role) {
    case "PARTNER_VIEWER":
      return "Viewer";
    case "PARTNER_OPERATOR":
      return "Operator";
    case "PARTNER_MANAGER":
      return "Manager";
  }
}

function originLabel(client: OrganizationClientStaffing, kind: "facility_admin" | "partner_org_admin") {
  if (kind === "facility_admin") return `Assigned by ${client.facilityDisplayName}`;
  return `Assigned by ${client.organizationDisplayName}`;
}

function lifecycleLabel(lifecycle: OrganizationClientStaffing["lifecycle"]) {
  switch (lifecycle) {
    case "ACTIVE":
      return "Active";
    case "SUSPENDED":
      return "Suspended";
    case "ENDED":
      return "Ended";
    case "PENDING":
      return "Pending";
  }
}

export function OrganizationClientStaffingList({ clients }: { clients: OrganizationClientStaffing[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (formData: FormData) => Promise<{ ok: boolean; message?: string }>, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.message ?? "Staffing could not be updated.");
        return;
      }
      router.refresh();
    });
  }

  const current = clients.filter((client) => client.lifecycle !== "ENDED");
  const ended = clients.filter((client) => client.lifecycle === "ENDED");

  return (
    <div className="space-y-6" data-testid="organization-clients">
      {error ? (
        <p className="text-sm text-red-700" data-testid="organization-clients-error">
          {error}
        </p>
      ) : null}
      {current.length === 0 && ended.length === 0 ? (
        <p className="text-sm text-zinc-600">No client facilities are connected to this organization yet.</p>
      ) : null}
      {current.map((client) => (
        <ClientCard key={client.facilityPartnerOrganizationId} client={client} pending={pending} run={run} />
      ))}
      {ended.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900">Past client facilities</h2>
          {ended.map((client) => (
            <ClientCard key={client.facilityPartnerOrganizationId} client={client} pending={pending} run={run} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ClientCard({
  client,
  pending,
  run,
}: {
  client: OrganizationClientStaffing;
  pending: boolean;
  run: (action: (formData: FormData) => Promise<{ ok: boolean; message?: string }>, formData: FormData) => void;
}) {
  const roleChoices = client.maximumPartnerRole ? partnerRolesAtOrBelow(client.maximumPartnerRole) : [];
  return (
    <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4" data-testid={`client-${client.facilityId}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900">{client.facilityDisplayName}</h2>
        <p className="text-xs font-medium text-zinc-500">{lifecycleLabel(client.lifecycle)}</p>
      </div>
      <dl className="mt-3 space-y-2 text-sm text-zinc-700">
        <div>
          <dt className="font-medium text-zinc-900">Departments</dt>
          <dd>{client.departmentNames.length > 0 ? client.departmentNames.join(", ") : "None"}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-900">Maximum partner role</dt>
          <dd>
            {client.maximumPartnerRole
              ? partnerRoleLabel(client.maximumPartnerRole)
              : "Personal access disabled"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-900">Staffing management</dt>
          <dd>
            {client.staffingDelegated
              ? `${client.organizationDisplayName} may manage assignments`
              : `Managed by ${client.facilityDisplayName}`}
          </dd>
        </div>
      </dl>
      {!client.maximumPartnerRole && client.lifecycle === "ACTIVE" ? (
        <p className="mt-3 text-sm text-zinc-600">
          Personal facility access is not currently enabled by the facility.
        </p>
      ) : null}
      {client.lifecycle === "SUSPENDED" ? (
        <p className="mt-3 text-sm text-zinc-600">This client relationship is suspended. Staffing changes are unavailable.</p>
      ) : null}
      {client.lifecycle === "PENDING" ? (
        <p className="mt-3 text-sm text-zinc-600">This client relationship is not active yet.</p>
      ) : null}

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-zinc-900">Assigned members</h3>
        {client.assignments.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">No members are currently assigned.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100">
            {client.assignments.map((assignment) => (
              <li key={assignment.userId} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="text-sm">
                  <p className="font-medium text-zinc-900">{assignment.displayName}</p>
                  <p className="text-xs text-zinc-500">
                    {organizationMembershipRoleLabel(assignment.organizationRole)}
                    {" · "}
                    {partnerRoleLabel(assignment.partnerRole)}
                    {" · "}
                    {originLabel(client, assignment.createdByAuthorityKind)}
                  </p>
                </div>
                {client.canManageStaffing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <form
                      className="flex items-center gap-2"
                      action={(formData) => run(changeOrganizationClientRoleAction, formData)}
                    >
                      <input type="hidden" name="facilityPartnerOrganizationId" value={client.facilityPartnerOrganizationId} />
                      <input type="hidden" name="targetUserId" value={assignment.userId} />
                      <label className="sr-only" htmlFor={`role-${client.facilityId}-${assignment.userId}`}>
                        Partner role for {assignment.displayName}
                      </label>
                      <select
                        id={`role-${client.facilityId}-${assignment.userId}`}
                        name="partnerRole"
                        defaultValue={assignment.partnerRole}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                      >
                        {roleChoices.map((role) => (
                          <option key={role} value={role}>
                            {choiceLabel(role)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-sm font-medium"
                      >
                        Change role
                      </button>
                    </form>
                    <form action={(formData) => run(endOrganizationClientAccessAction, formData)}>
                      <input type="hidden" name="facilityPartnerOrganizationId" value={client.facilityPartnerOrganizationId} />
                      <input type="hidden" name="targetUserId" value={assignment.userId} />
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-md border border-zinc-300 px-2 py-1 text-sm font-medium"
                      >
                        End access
                      </button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {client.restrictedMembers.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-zinc-900">Restricted members</h3>
          <ul className="mt-2 space-y-1">
            {client.restrictedMembers.map((member) => (
              <li key={member.userId} className="text-sm text-zinc-700">
                {member.displayName}
                <span className="text-zinc-500"> · Restricted by facility</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {client.canManageStaffing ? (
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <h3 className="text-sm font-semibold text-zinc-900">Assign member</h3>
          {client.eligibleMembers.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-500">No current members are available to assign.</p>
          ) : (
            <form
              className="mt-2 flex flex-wrap items-end gap-2"
              action={(formData) => run(assignOrganizationClientAction, formData)}
            >
              <input type="hidden" name="facilityPartnerOrganizationId" value={client.facilityPartnerOrganizationId} />
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-zinc-600">Member</span>
                <select name="targetUserId" className="rounded-md border border-zinc-300 px-2 py-1 text-sm" required>
                  {client.eligibleMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-zinc-600">Partner role</span>
                <select name="partnerRole" className="rounded-md border border-zinc-300 px-2 py-1 text-sm" required>
                  {roleChoices.map((role) => (
                    <option key={role} value={role}>
                      {choiceLabel(role)}
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
          )}
        </div>
      ) : null}
    </section>
  );
}
