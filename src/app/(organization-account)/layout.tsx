import { redirect } from "next/navigation";

import { GlobalUserMenu } from "@/components/global-user-menu";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { presentCurrentContextFromSession } from "@/lib/available-contexts";
import { getAppSession, isOrganizationScopedSession } from "@/lib/auth";
import {
  listCurrentOrganizationMembershipsForUser,
  organizationDisplayLabel,
} from "@/lib/organization-membership";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = {
  children: React.ReactNode;
};

/**
 * Minimal chrome for organization-scoped account sessions.
 * Not the Facility AppShell and not a corporate portfolio.
 */
export default async function OrganizationAccountLayout({ children }: Props) {
  const session = await getAppSession();
  if (!session) {
    redirect("/login");
  }
  if (!isOrganizationScopedSession(session)) {
    redirect("/login");
  }

  const memberships = await listCurrentOrganizationMembershipsForUser(prisma, {
    userId: session.uid,
  });
  const currentMembership = memberships.find(
    (membership) => membership.organizationId === session.organizationId,
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Organization account
            </p>
            <p className="text-sm font-semibold text-zinc-900">{session.name}</p>
          </div>
          <GlobalUserMenu
            menuLabel={session.name}
            currentContext={presentCurrentContextFromSession(session, {
              organizationName: currentMembership
                ? organizationDisplayLabel(currentMembership.organization)
                : null,
              organizationRole: currentMembership?.currentRole,
            })}
          />
        </div>
        {memberships.length > 1 ? (
          <div className="mx-auto max-w-3xl px-4 pb-4">
            <OrganizationSwitcher
              currentOrganizationId={session.organizationId}
              options={memberships.map((membership) => ({
                organizationId: membership.organizationId,
                label: organizationDisplayLabel(membership.organization),
              }))}
            />
          </div>
        ) : null}
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
