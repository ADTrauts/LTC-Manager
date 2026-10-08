"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  assignPartnerUserAction,
  changePartnerUserRoleAction,
  endPartnerUserAssignmentAction,
  setPartnerRoleCeilingAction,
} from "@/app/(protected)/admin/organization/partners/user-access-actions";
import type { OrganizationMembershipRole, OrganizationPartnerRole } from "@prisma/client";

import { partnerRoleLabel, partnerRolesAtOrBelow } from "@/lib/partner-user-access";
import { organizationMembershipRoleLabel } from "@/lib/organization-membership";

export type PartnerUserAccessPanelProps = {
  partnershipId: string;
  partnershipEnded: boolean;
  ceiling: OrganizationPartnerRole | null;
  unassigned: Array<{
    userId: string;
    displayName: string;
    organizationRole: OrganizationMembershipRole;
  }>;
  current: Array<{
    userId: string;
    displayName: string;
    organizationRole: OrganizationMembershipRole;
    assignedRole: OrganizationPartnerRole;
    effectiveRole: OrganizationPartnerRole | null;
  }>;
  history: Array<{
    id: string;
    displayName: string;
    partnerRole: OrganizationPartnerRole;
    range: string;
  }>;
};

export function PartnerUserAccessPanel({
  partnershipId,
  partnershipEnded,
  ceiling,
  unassigned,
  current,
  history,
}: PartnerUserAccessPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const roleChoices = ceiling ? partnerRolesAtOrBelow(ceiling) : [];

  function run(
    action: (formData: FormData) => Promise<{ ok: boolean; message: string }>,
    formData: FormData,
  ) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6" data-testid="partner-user-access-panel">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Partner user access</h2>
        <p className="mt-1 text-sm text-zinc-600">
          The Facility sets the maximum partner role and assigns current Organization members.
          Organization role and partner role are separate. A valid assignment does not open this
          Facility.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-700" data-testid="partner-user-access-error">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-zinc-700" data-testid="partner-user-access-message">
          {message}
        </p>
      ) : null}

      <form
        className="space-y-2"
        action={(formData) => run(setPartnerRoleCeilingAction, formData)}
      >
        <input type="hidden" name="partnershipId" value={partnershipId} />
        <label className="block text-sm font-medium text-zinc-900" htmlFor="maxPartnerRole">
          Maximum partner role
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="maxPartnerRole"
            name="maxPartnerRole"
            defaultValue={ceiling ?? "disabled"}
            disabled={pending || partnershipEnded}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            data-testid="partner-role-ceiling"
          >
            <option value="disabled">Personal access disabled</option>
            <option value="PARTNER_VIEWER">Partner Viewer</option>
            <option value="PARTNER_OPERATOR">Partner Operator</option>
            <option value="PARTNER_MANAGER">Partner Manager</option>
          </select>
          <button
            type="submit"
            disabled={pending || partnershipEnded}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Save ceiling
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          {ceiling
            ? `Current maximum is ${partnerRoleLabel(ceiling)}. Lowering it reduces effective authority without rewriting assignment history.`
            : "No current ceiling. Personal partner authorization is off."}
        </p>
      </form>

      {ceiling && !partnershipEnded ? (
        <form className="space-y-2" action={(formData) => run(assignPartnerUserAction, formData)}>
          <input type="hidden" name="partnershipId" value={partnershipId} />
          <h3 className="text-sm font-semibold text-zinc-900">Assign a current member</h3>
          {unassigned.length === 0 ? (
            <p className="text-sm text-zinc-500">No unassigned current Organization members.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                name="userId"
                required
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                data-testid="partner-assign-user"
              >
                {unassigned.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName} · {organizationMembershipRoleLabel(member.organizationRole)}
                  </option>
                ))}
              </select>
              <select
                name="partnerRole"
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                data-testid="partner-assign-role"
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
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          )}
        </form>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Current assignments</h3>
        {current.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">No current partner users.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100" data-testid="partner-current-assignments">
            {current.map((member) => (
              <li key={member.userId} className="space-y-2 py-3 text-sm text-zinc-700">
                <div>
                  <span className="font-medium text-zinc-900">{member.displayName}</span>
                  <span className="mx-1.5 text-zinc-300">·</span>
                  <span>Organization role {organizationMembershipRoleLabel(member.organizationRole)}</span>
                  <span className="mx-1.5 text-zinc-300">·</span>
                  <span>Partner role {partnerRoleLabel(member.assignedRole)}</span>
                  {member.effectiveRole && member.effectiveRole !== member.assignedRole ? (
                    <span> · Effective {partnerRoleLabel(member.effectiveRole)}</span>
                  ) : null}
                </div>
                {ceiling ? (
                  <form
                    className="flex flex-wrap items-center gap-2"
                    action={(formData) => run(changePartnerUserRoleAction, formData)}
                  >
                    <input type="hidden" name="partnershipId" value={partnershipId} />
                    <input type="hidden" name="userId" value={member.userId} />
                    <select
                      name="partnerRole"
                      defaultValue={member.assignedRole}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                    >
                      {roleChoices.map((role) => (
                        <option key={role} value={role}>
                          {partnerRoleLabel(role)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={pending || partnershipEnded}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      Change role
                    </button>
                  </form>
                ) : null}
                <form action={(formData) => run(endPartnerUserAssignmentAction, formData)}>
                  <input type="hidden" name="partnershipId" value={partnershipId} />
                  <input type="hidden" name="userId" value={member.userId} />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    End assignment
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Assignment history</h3>
        {history.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">No partner role periods yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100">
            {history.map((period) => (
              <li key={period.id} className="py-2 text-sm text-zinc-700">
                <span className="font-medium text-zinc-900">{period.displayName}</span>
                <span className="mx-1.5 text-zinc-300">·</span>
                {partnerRoleLabel(period.partnerRole)}
                <span className="mx-1.5 text-zinc-300">·</span>
                {period.range}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
