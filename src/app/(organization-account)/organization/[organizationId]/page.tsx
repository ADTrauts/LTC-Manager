import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireOrganizationSession } from "@/lib/organization-context";
import {
  getOrganizationMembers,
  organizationDisplayLabel,
  organizationMembershipRoleLabel,
} from "@/lib/organization-membership";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ organizationId: string }>;
};

export default async function OrganizationHomeDetailPage({ params }: PageProps) {
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

  if (session.organizationId !== organizationId) {
    // Multi-org: allow opening another membership by minting selection via redirect to index
    // when the selected session org differs. Detail requires matching session organizationId.
    redirect("/organization");
  }

  if (membership.organizationId !== organizationId) {
    notFound();
  }

  const members =
    membership.currentRole === "ORG_ADMIN"
      ? await getOrganizationMembers(prisma, { organizationId })
      : [];

  return (
    <div className="space-y-6" data-testid="organization-home-detail">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {organizationDisplayLabel(membership.organization)}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Your organization role:{" "}
          <span className="font-medium text-zinc-900">
            {membership.currentRole
              ? organizationMembershipRoleLabel(membership.currentRole)
              : "None"}
          </span>
        </p>
        {membership.currentRole === "ORG_ADMIN" ? (
          <p className="mt-2 text-sm font-medium text-zinc-800" data-testid="org-admin-banner">
            You are an Organization Administrator.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-zinc-500">
          Organization membership does not grant access to customer Facilities. Partner Facility
          assignment is not available in this phase.
        </p>
        {membership.currentRole === "ORG_ADMIN" ? (
          <p className="mt-3">
            <Link
              href={`/organization/${organizationId}/members`}
              className="text-sm font-medium underline-offset-2 hover:underline"
            >
              Manage members
            </Link>
          </p>
        ) : null}
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Organization identity</h2>
        <dl className="mt-2 space-y-1 text-sm text-zinc-700">
          <div>
            <dt className="inline font-medium text-zinc-900">Name </dt>
            <dd className="inline">{membership.organization.name}</dd>
          </div>
          {membership.organization.displayName ? (
            <div>
              <dt className="inline font-medium text-zinc-900">Display name </dt>
              <dd className="inline">{membership.organization.displayName}</dd>
            </div>
          ) : null}
          {membership.organization.organizationType ? (
            <div>
              <dt className="inline font-medium text-zinc-900">Type </dt>
              <dd className="inline">{membership.organization.organizationType}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {membership.currentRole === "ORG_ADMIN" ? (
        <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Members</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Organization membership does not grant Facility access.
          </p>
          {members.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No current members.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100">
              {members.map(({ user, membership: row }) => (
                <li key={row.id} className="py-2 text-sm">
                  <p className="font-medium text-zinc-900">{user.displayName}</p>
                  <p className="text-xs text-zinc-500">
                    {user.email}
                    {row.currentRole
                      ? ` · ${organizationMembershipRoleLabel(row.currentRole)}`
                      : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <p className="text-sm">
        <Link href="/organization" className="font-medium underline-offset-2 hover:underline">
          All Organizations
        </Link>
      </p>
    </div>
  );
}
