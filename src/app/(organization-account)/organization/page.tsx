import Link from "next/link";
import { redirect } from "next/navigation";

import { getAppSession, isOrganizationScopedSession } from "@/lib/auth";
import {
  listCurrentOrganizationMembershipsForUser,
  organizationDisplayLabel,
  organizationMembershipRoleLabel,
} from "@/lib/organization-membership";
import { prisma } from "@/lib/prisma";

export default async function OrganizationHomeIndexPage() {
  const session = await getAppSession();
  if (!session || !isOrganizationScopedSession(session) || session.authKind !== "user") {
    redirect("/login");
  }

  const memberships = await listCurrentOrganizationMembershipsForUser(prisma, {
    userId: session.uid,
  });

  if (memberships.length === 1) {
    redirect(`/organization/${memberships[0]!.organizationId}`);
  }

  return (
    <div className="space-y-6" data-testid="organization-home-index">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Your Organizations</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Organization membership does not grant access to customer Facilities.
        </p>
      </div>

      {memberships.length === 0 ? (
        <p className="text-sm text-zinc-600">No active Organization memberships.</p>
      ) : (
        <ul className="space-y-3">
          {memberships.map((membership) => (
            <li
              key={membership.id}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-4"
            >
              <p className="text-base font-semibold text-zinc-900">
                {organizationDisplayLabel(membership.organization)}
              </p>
              <p className="mt-0.5 text-sm text-zinc-600">
                {membership.currentRole
                  ? organizationMembershipRoleLabel(membership.currentRole)
                  : "No current role"}
              </p>
              <Link
                href={`/organization/${membership.organizationId}`}
                className="mt-2 inline-flex text-sm font-semibold text-zinc-900 underline-offset-2 hover:underline"
              >
                Open →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
