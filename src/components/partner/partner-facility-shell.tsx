import { GlobalUserMenu } from "@/components/global-user-menu";
import { PartnerDepartmentSwitch } from "@/components/partner/partner-department-switch";
import { ShellBrandBlock } from "@/components/shell-brand-block";
import { ShellModeFrame } from "@/components/shell-mode-frame";
import { CompactWorkspaceMenu } from "@/components/shell/compact-workspace-menu";
import { WorkspaceSelector } from "@/components/shell/workspace-selector";
import { WorkspaceOwnedNav } from "@/components/shell/workspace-owned-nav";
import { WorkspaceShellHeader } from "@/components/shell/workspace-shell-header";
import { WorkspaceShellRail } from "@/components/shell/workspace-shell-rail";
import type { PartnerFacilitySession } from "@/lib/auth";
import {
  loadWorkspaceSelectorModel,
  presentCurrentContextFromSession,
} from "@/lib/available-contexts";
import type { PartnerFacilityShellModel } from "@/lib/partner-operational-context";
import { partnerRoleLabel } from "@/lib/partner-user-access";

const PARTNER_DESTINATIONS = [
  { href: "/partner", label: "Dashboard" },
  { href: "/partner/logs", label: "Logs" },
  { href: "/partner/reports", label: "Audit / Reports" },
  { href: "/partner/locations", label: "Locations" },
  { href: "/partner/assets", label: "Assets" },
] as const;

export async function PartnerFacilityShell({
  shell,
  session,
  children,
}: {
  shell: PartnerFacilityShellModel;
  session: PartnerFacilitySession;
  children: React.ReactNode;
}) {
  const active = shell.departments.find((department) => department.id === shell.context.activeDepartmentId);
  const currentWorkspace = presentCurrentContextFromSession(session, {
    facilityName: shell.facilityDisplayName,
    partnerOrganizationName: shell.partnerOrganizationName,
    partnerRole: shell.context.effectiveRole,
  });
  const workspaceSelector = await loadWorkspaceSelectorModel(session);

  const departmentNode = () =>
    shell.departments.length > 1 ? (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Department</p>
        <PartnerDepartmentSwitch
          departments={shell.departments}
          activeDepartmentId={shell.context.activeDepartmentId}
        />
      </div>
    ) : (
      <p className="text-sm text-zinc-800">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Department
        </span>
        {active?.name ?? "Department"}
      </p>
    );

  const destinationsNode = () => (
    <WorkspaceOwnedNav items={PARTNER_DESTINATIONS} label="Partner" />
  );

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
            <div className="space-y-4">
              {departmentNode()}
              {destinationsNode()}
            </div>
          </CompactWorkspaceMenu>
        }
        brand={<ShellBrandBlock />}
        workspace={workspaceNode()}
        account={<GlobalUserMenu menuLabel={session.name} currentContext={null} compactTrigger />}
      />
      <div className="mx-auto flex min-h-0 w-full flex-1 overflow-hidden">
        <WorkspaceShellRail department={departmentNode()} destinations={destinationsNode()} />
        <main data-shell-main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <p className="sr-only" data-testid="partner-effective-role">
            {partnerRoleLabel(shell.context.effectiveRole)}
          </p>
          {children}
        </main>
      </div>
    </ShellModeFrame>
  );
}
