import { leavePartnerFacilityAction } from "@/app/partner/actions";
import { GlobalUserMenu } from "@/components/global-user-menu";
import { PartnerDepartmentSwitch } from "@/components/partner/partner-department-switch";
import { ShellBrandBlock } from "@/components/shell-brand-block";
import { CompactWorkspaceMenu } from "@/components/shell/compact-workspace-menu";
import { CurrentWorkspaceRegion } from "@/components/shell/current-workspace-region";
import { WorkspaceOwnedNav } from "@/components/shell/workspace-owned-nav";
import { WorkspaceShellRail } from "@/components/shell/workspace-shell-rail";
import type { PartnerFacilitySession } from "@/lib/auth";
import { presentCurrentContextFromSession } from "@/lib/available-contexts";
import type { PartnerFacilityShellModel } from "@/lib/partner-operational-context";
import { partnerRoleLabel } from "@/lib/partner-user-access";

const PARTNER_DESTINATIONS = [
  { href: "/partner", label: "Dashboard" },
  { href: "/partner/logs", label: "Logs" },
  { href: "/partner/reports", label: "Audit / Reports" },
  { href: "/partner/locations", label: "Locations" },
  { href: "/partner/assets", label: "Assets" },
] as const;

function PartnerLeave({ organizationName }: { organizationName: string }) {
  return (
    <form action={leavePartnerFacilityAction}>
      <button type="submit" className="text-sm font-medium underline-offset-2 hover:underline">
        Return to {organizationName}
      </button>
    </form>
  );
}

export function PartnerFacilityShell({
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
  const leaveNode = () => <PartnerLeave organizationName={shell.partnerOrganizationName} />;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white xl:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <CompactWorkspaceMenu>
            <div className="space-y-4">
              {departmentNode()}
              {destinationsNode()}
              {leaveNode()}
            </div>
          </CompactWorkspaceMenu>
          <ShellBrandBlock compact />
          <div className="min-w-0 flex-1">
            <CurrentWorkspaceRegion current={currentWorkspace} compact />
          </div>
          <GlobalUserMenu menuLabel={session.name} currentContext={currentWorkspace} compactTrigger />
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full flex-1">
        <WorkspaceShellRail
          brand={<ShellBrandBlock />}
          workspace={<CurrentWorkspaceRegion current={currentWorkspace} />}
          department={departmentNode()}
          destinations={destinationsNode()}
          compatibility={leaveNode()}
          account={<GlobalUserMenu menuLabel={session.name} currentContext={null} />}
        />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <p className="sr-only" data-testid="partner-effective-role">
            {partnerRoleLabel(shell.context.effectiveRole)}
          </p>
          {children}
        </main>
      </div>
    </div>
  );
}
