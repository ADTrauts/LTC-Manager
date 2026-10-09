"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  assignPartnerUserAction,
  blockPartnerUserAction,
  changePartnerUserRoleAction,
  endPartnerUserAssignmentAction,
  setPartnerRoleCeilingAction,
  setPartnerStaffingDelegationAction,
  unblockPartnerUserAction,
} from "@/app/(protected)/admin/organization/partners/user-access-actions";
import type { OrganizationMembershipRole, OrganizationPartnerRole } from "@prisma/client";

import {
  partnerRoleLabel,
  partnerRolesAtOrBelow,
  type PartnerAssignmentAuthorityKind,
} from "@/lib/partner-user-access";
import { organizationMembershipRoleLabel } from "@/lib/organization-membership";

export type PartnerUserAccessPanelProps = {
  partnershipId: string;
  partnershipEnded: boolean;
  facilityDisplayName: string;
  organizationDisplayName: string;
  staffingDelegationEnabled: boolean;
  ceiling: OrganizationPartnerRole | null;
  unassigned: Array<{
    userId: string;
    displayName: string;
    organizationRole: OrganizationMembershipRole;
    restricted: boolean;
    restrictionNote: string | null;
  }>;
  current: Array<{
    userId: string;
    displayName: string;
    organizationRole: OrganizationMembershipRole;
    assignedRole: OrganizationPartnerRole;
    effectiveRole: OrganizationPartnerRole | null;
    createdByAuthorityKind: PartnerAssignmentAuthorityKind | null;
  }>;
  history: Array<{
    id: string;
    displayName: string;
    partnerRole: OrganizationPartnerRole;
    range: string;
    createdByAuthorityKind: PartnerAssignmentAuthorityKind;
  }>;
};

function assignmentOrigin(
  kind: PartnerAssignmentAuthorityKind | null,
  facilityDisplayName: string,
  organizationDisplayName: string,
): string | null {
  if (kind === "facility_admin") return `Assigned by ${facilityDisplayName}`;
  if (kind === "partner_org_admin") return `Assigned by ${organizationDisplayName}`;
  return null;
}

export function PartnerUserAccessPanel({
  partnershipId,
  partnershipEnded,
  facilityDisplayName,
  organizationDisplayName,
  staffingDelegationEnabled,
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

      <form
        key={staffingDelegationEnabled ? "organization" : "facility"}
        className="space-y-2"
        action={(formData) => run(setPartnerStaffingDelegationAction, formData)}
      >
        <input type="hidden" name="partnershipId" value={partnershipId} />
        <fieldset className="space-y-2" disabled={pending || partnershipEnded}>
          <legend className="text-sm font-medium text-zinc-900">
            Who manages individual partner assignments?
          </legend>
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="radio"
              name="delegation"
              value="facility"
              defaultChecked={!staffingDelegationEnabled}
              data-testid="partner-staffing-facility"
            />
            <span>Facility administrators only</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-zinc-700">
            <input
              type="radio"
              name="delegation"
              value="organization"
              defaultChecked={staffingDelegationEnabled}
              data-testid="partner-staffing-organization"
            />
            <span>{organizationDisplayName} administrators may manage their members</span>
          </label>
        </fieldset>
        <button
          type="submit"
          disabled={pending || partnershipEnded}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Save staffing policy
        </button>
        <p className="text-xs text-zinc-500">
          Changing who may manage assignments does not remove current assignments. Organization
          administrators still cannot change assignments in this phase.
        </p>
      </form>

      {ceiling && !partnershipEnded ? (
        <form className="space-y-2" action={(formData) => run(assignPartnerUserAction, formData)}>
          <input type="hidden" name="partnershipId" value={partnershipId} />
          <h3 className="text-sm font-semibold text-zinc-900">Assign a current member</h3>
          {unassigned.length === 0 ? (
            <p className="text-sm text-zinc-500">No unassigned current Organization members.</p>
          ) : unassigned.every((member) => member.restricted) ? (
            <p className="text-sm text-zinc-500">Every current member is assigned or restricted.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                name="userId"
                required
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                data-testid="partner-assign-user"
              >
                {unassigned
                  .filter((member) => !member.restricted)
                  .map((member) => (
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
                  {assignmentOrigin(
                    member.createdByAuthorityKind,
                    facilityDisplayName,
                    organizationDisplayName,
                  ) ? (
                    <span>
                      {" "}
                      ·{" "}
                      {assignmentOrigin(
                        member.createdByAuthorityKind,
                        facilityDisplayName,
                        organizationDisplayName,
                      )}
                    </span>
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
                    End access
                  </button>
                </form>
                <form className="flex flex-wrap items-center gap-2" action={(formData) => run(blockPartnerUserAction, formData)}>
                  <input type="hidden" name="partnershipId" value={partnershipId} />
                  <input type="hidden" name="userId" value={member.userId} />
                  <input
                    name="note"
                    placeholder="Facility note"
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                    data-testid={`partner-block-note-${member.userId}`}
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-800 disabled:opacity-50"
                  >
                    Block
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Restricted by facility</h3>
        {unassigned.filter((member) => member.restricted).length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">No current Facility restrictions.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100" data-testid="partner-restricted-users">
            {unassigned
              .filter((member) => member.restricted)
              .map((member) => (
                <li key={member.userId} className="space-y-2 py-3 text-sm text-zinc-700">
                  <div>
                    <span className="font-medium text-zinc-900">{member.displayName}</span>
                    <span className="mx-1.5 text-zinc-300">·</span>
                    <span>Restricted by facility</span>
                  </div>
                  {member.restrictionNote ? (
                    <p className="text-xs text-zinc-500">Facility note: {member.restrictionNote}</p>
                  ) : null}
                  <form action={(formData) => run(unblockPartnerUserAction, formData)}>
                    <input type="hidden" name="partnershipId" value={partnershipId} />
                    <input type="hidden" name="userId" value={member.userId} />
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      Unblock
                    </button>
                  </form>
                </li>
              ))}
          </ul>
        )}
      </div>

      {!partnershipEnded ? (
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">Block a member who is not assigned</h3>
          <p className="mt-1 text-sm text-zinc-600">
            A restriction stands on its own. It does not create an assignment.
          </p>
          {unassigned.filter((member) => !member.restricted).length === 0 ? (
            <p className="mt-1 text-sm text-zinc-500">No unrestricted unassigned members.</p>
          ) : (
            <form
              className="mt-2 flex flex-wrap items-center gap-2"
              action={(formData) => run(blockPartnerUserAction, formData)}
            >
              <input type="hidden" name="partnershipId" value={partnershipId} />
              <select
                name="userId"
                required
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                data-testid="partner-block-unassigned"
              >
                {unassigned
                  .filter((member) => !member.restricted)
                  .map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.displayName}
                    </option>
                  ))}
              </select>
              <input
                name="note"
                placeholder="Facility note"
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              />
              <button
                type="submit"
                disabled={pending}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-800 disabled:opacity-50"
              >
                Block
              </button>
            </form>
          )}
        </div>
      ) : null}

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
                {assignmentOrigin(
                  period.createdByAuthorityKind,
                  facilityDisplayName,
                  organizationDisplayName,
                ) ? (
                  <>
                    <span className="mx-1.5 text-zinc-300">·</span>
                    {assignmentOrigin(
                      period.createdByAuthorityKind,
                      facilityDisplayName,
                      organizationDisplayName,
                    )}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
