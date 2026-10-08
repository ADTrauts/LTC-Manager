"use client";

import { useState, useTransition } from "react";

import {
  changeOrganizationMemberRoleAction,
  endOrganizationMemberAction,
  resendOrganizationMemberInvitationAction,
  revokeOrganizationMemberInvitationAction,
  type OrganizationAdminActionResult,
} from "@/app/(organization-account)/organization/actions";

export function OrganizationMemberAdminControls({
  organizationId,
  targetUserId,
  currentRole,
  isSelf,
}: {
  organizationId: string;
  targetUserId: string;
  currentRole: "ORG_ADMIN" | "ORG_MEMBER";
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OrganizationAdminActionResult | null>(null);
  const nextRole = currentRole === "ORG_ADMIN" ? "ORG_MEMBER" : "ORG_ADMIN";

  function run(action: (formData: FormData) => Promise<OrganizationAdminActionResult>, extra: Record<string, string>) {
    const formData = new FormData();
    formData.set("organizationId", organizationId);
    for (const [key, value] of Object.entries(extra)) formData.set(key, value);
    startTransition(async () => {
      setResult(await action(formData));
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
          onClick={() =>
            run(changeOrganizationMemberRoleAction, { targetUserId, role: nextRole })
          }
        >
          {nextRole === "ORG_ADMIN" ? "Make administrator" : "Make member"}
        </button>
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
          onClick={() => run(endOrganizationMemberAction, { targetUserId })}
        >
          {isSelf ? "Leave organization" : "End membership"}
        </button>
      </div>
      {result ? (
        <p className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
          {result.message}
        </p>
      ) : null}
    </div>
  );
}

export function OrganizationInvitationControls({
  organizationId,
  invitationId,
}: {
  organizationId: string;
  invitationId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<OrganizationAdminActionResult | null>(null);

  function run(action: (formData: FormData) => Promise<OrganizationAdminActionResult>) {
    const formData = new FormData();
    formData.set("organizationId", organizationId);
    formData.set("invitationId", invitationId);
    startTransition(async () => setResult(await action(formData)));
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
          onClick={() => run(resendOrganizationMemberInvitationAction)}
        >
          Resend
        </button>
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
          onClick={() => run(revokeOrganizationMemberInvitationAction)}
        >
          Revoke
        </button>
      </div>
      {result ? (
        <p className={`text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
