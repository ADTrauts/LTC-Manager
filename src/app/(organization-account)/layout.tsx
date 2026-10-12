import { redirect } from "next/navigation";

import { GlobalUserMenu } from "@/components/global-user-menu";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { OrganizationWorkspaceNav } from "@/components/organization-workspace-nav";
import { ShellBrandBlock } from "@/components/shell-brand-block";
import { CompactWorkspaceMenu } from "@/components/shell/compact-workspace-menu";
import { CurrentWorkspaceRegion } from "@/components/shell/current-workspace-region";
import { WorkspaceShellRail } from "@/components/shell/workspace-shell-rail";
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
 * Organization workspace chrome. Session remains organization-scoped.
 * OrganizationSwitcher stays available until the Workspace selector ACT.
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
  const currentWorkspace = presentCurrentContextFromSession(session, {
    organizationName: currentMembership
      ? organizationDisplayLabel(currentMembership.organization)
      : null,
    organizationRole: currentMembership?.currentRole,
  });
  const isAdmin = currentMembership?.currentRole === "ORG_ADMIN";

  const switcherNode = () =>
    memberships.length > 1 ? (
      <OrganizationSwitcher
        currentOrganizationId={session.organizationId}
        options={memberships.map((membership) => ({
          organizationId: membership.organizationId,
          label: organizationDisplayLabel(membership.organization),
        }))}
      />
    ) : null;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white xl:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <CompactWorkspaceMenu>
            <div className="space-y-4">
              <OrganizationWorkspaceNav organizationId={session.organizationId} isAdmin={isAdmin} />
              {switcherNode()}
            </div>
          </CompactWorkspaceMenu>
          <ShellBrandBlock compact />
          <div className="min-w-0 flex-1">
            <CurrentWorkspaceRegion current={currentWorkspace} compact />
          </div>
          <GlobalUserMenu
            menuLabel={session.name}
            currentContext={currentWorkspace}
            compactTrigger
          />
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full flex-1">
        <WorkspaceShellRail
          brand={<ShellBrandBlock />}
          workspace={<CurrentWorkspaceRegion current={currentWorkspace} />}
          destinations={
            <OrganizationWorkspaceNav organizationId={session.organizationId} isAdmin={isAdmin} />
          }
          compatibility={switcherNode()}
          account={<GlobalUserMenu menuLabel={session.name} currentContext={null} />}
        />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
