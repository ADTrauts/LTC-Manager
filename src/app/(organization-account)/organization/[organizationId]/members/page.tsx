import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { OrganizationInvitationControls, OrganizationMemberAdminControls } from "@/components/organization-member-admin-controls";
import { OrganizationInviteForm } from "@/components/organization-invite-form";
import { OrganizationWorkspaceNav } from "@/components/organization-workspace-nav";
import { requireOrganizationSession } from "@/lib/organization-context";
import {
  getOrganizationMembers,
  organizationDisplayLabel,
  organizationMembershipRoleLabel,
} from "@/lib/organization-membership";
import {
  listOrganizationMemberInvitations,
  organizationMemberInvitationDeliveryLabel,
} from "@/lib/organization-member-invitations";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ organizationId: string }> };

export default async function OrganizationMembersPage({ params }: PageProps) {
  const { organizationId } = await params;
  let session;
  let membership;
  try {
    const required = await requireOrganizationSession();
    session = required.session;
    membership = required.membership;
  } catch {
    redirect("/login");
  }
  if (session.organizationId !== organizationId) redirect("/organization");
  if (membership.currentRole !== "ORG_ADMIN") notFound();

  const [members, invitations] = await Promise.all([
    getOrganizationMembers(prisma, { organizationId }),
    listOrganizationMemberInvitations(prisma, {
      organizationId,
      actorUserId: session.uid,
    }),
  ]);

  return (
    <div className="space-y-6" data-testid="organization-members-page">
      <OrganizationWorkspaceNav organizationId={organizationId} current="members" isAdmin />
      <div>
        <p className="text-xs text-zinc-500">
          <Link href={`/organization/${organizationId}`} className="underline-offset-2 hover:underline">
            {organizationDisplayLabel(membership.organization)}
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Members</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Organization roles do not grant customer Facility access.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold">Invite member</h2>
        <OrganizationInviteForm organizationId={organizationId} />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold">Current members</h2>
        <ul className="mt-3 divide-y divide-zinc-100">
          {members.map(({ user, membership: row }) => (
            <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">{user.displayName}</p>
                <p className="text-xs text-zinc-500">
                  {user.email}
                  {row.currentRole ? ` · ${organizationMembershipRoleLabel(row.currentRole)}` : ""}
                  {" · Active"}
                </p>
              </div>
              {row.currentRole === "ORG_ADMIN" || row.currentRole === "ORG_MEMBER" ? (
                <OrganizationMemberAdminControls
                  organizationId={organizationId}
                  targetUserId={user.id}
                  currentRole={row.currentRole}
                  isSelf={user.id === session.uid}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold">Pending invitations</h2>
        {invitations.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No pending invitations.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{invitation.targetEmailNormalized}</p>
                  <p className="text-xs text-zinc-500">
                    {organizationMembershipRoleLabel(invitation.intendedRole)}
                    {" · "}
                    {invitation.displayStatus === "EXPIRED" ? "Expired" : "Pending"}
                    {organizationMemberInvitationDeliveryLabel(invitation.lastInvitationDeliveryStatus)
                      ? ` · ${organizationMemberInvitationDeliveryLabel(invitation.lastInvitationDeliveryStatus)}`
                      : ""}
                  </p>
                </div>
                <OrganizationInvitationControls
                  organizationId={organizationId}
                  invitationId={invitation.id}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
