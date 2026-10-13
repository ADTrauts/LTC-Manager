import { redirect } from "next/navigation";

import { GlobalUserMenu } from "@/components/global-user-menu";
import { OrganizationWorkspaceNav } from "@/components/organization-workspace-nav";
import { ShellBrandBlock } from "@/components/shell-brand-block";
import { ShellModeFrame } from "@/components/shell-mode-frame";
import { CompactWorkspaceMenu } from "@/components/shell/compact-workspace-menu";
import { WorkspaceSelector } from "@/components/shell/workspace-selector";
import { WorkspaceShellHeader } from "@/components/shell/workspace-shell-header";
import { WorkspaceShellRail } from "@/components/shell/workspace-shell-rail";
import {
  loadWorkspaceSelectorModel,
  presentCurrentContextFromSession,
} from "@/lib/available-contexts";
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
 * Workspace switching uses the canonical context-entry selector.
 */
export default async function OrganizationAccountLayout({ children }: Props) {
  const session = await getAppSession();
  if (!session) {
    redirect("/login");
  }
  if (!isOrganizationScopedSession(session)) {
    redirect("/login");
  }

  const [memberships, workspaceSelector] = await Promise.all([
    listCurrentOrganizationMembershipsForUser(prisma, {
      userId: session.uid,
    }),
    loadWorkspaceSelectorModel(session),
  ]);
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

  const workspaceNode = () =>
    workspaceSelector ? (
      <WorkspaceSelector
        current={currentWorkspace}
        currentContextKey={workspaceSelector.currentContextKey}
        items={workspaceSelector.items}
      />
    ) : null;

  return (
    <ShellModeFrame brandColor="#0f766e">
      <WorkspaceShellHeader
        menu={
          <CompactWorkspaceMenu>
            <OrganizationWorkspaceNav organizationId={session.organizationId} isAdmin={isAdmin} />
          </CompactWorkspaceMenu>
        }
        brand={<ShellBrandBlock />}
        workspace={workspaceNode()}
        account={
          <GlobalUserMenu menuLabel={session.name} currentContext={null} compactTrigger />
        }
      />
      <div className="mx-auto flex min-h-0 w-full flex-1 overflow-hidden">
        <WorkspaceShellRail
          destinations={
            <OrganizationWorkspaceNav organizationId={session.organizationId} isAdmin={isAdmin} />
          }
        />
        <main data-shell-main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </ShellModeFrame>
  );
}
