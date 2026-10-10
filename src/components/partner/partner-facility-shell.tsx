import Link from "next/link";

import { leavePartnerFacilityAction } from "@/app/partner/actions";
import { GlobalUserMenu } from "@/components/global-user-menu";
import { PartnerDepartmentSwitch } from "@/components/partner/partner-department-switch";
import type { PartnerFacilitySession } from "@/lib/auth";
import { presentCurrentContextFromSession } from "@/lib/available-contexts";
import type { PartnerFacilityShellModel } from "@/lib/partner-operational-context";
import { partnerRoleLabel } from "@/lib/partner-user-access";

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

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Partner access</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{shell.facilityDisplayName}</h1>
            <p className="mt-1 text-sm text-zinc-600">{shell.partnerOrganizationName}</p>
            <p className="mt-1 text-sm text-zinc-600" data-testid="partner-effective-role">
              {partnerRoleLabel(shell.context.effectiveRole)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <GlobalUserMenu
              menuLabel={session.name}
              currentContext={presentCurrentContextFromSession(session, {
                facilityName: shell.facilityDisplayName,
                partnerOrganizationName: shell.partnerOrganizationName,
                partnerRole: shell.context.effectiveRole,
              })}
            />
            <form action={leavePartnerFacilityAction}>
              <button type="submit" className="text-sm font-medium underline-offset-2 hover:underline">
                Return to {shell.partnerOrganizationName}
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-3xl gap-8 px-6 py-8 md:grid-cols-[12rem_1fr]">
        <nav className="space-y-4 text-sm" aria-label="Partner">
            <div className="flex flex-col gap-2">
              <Link href="/partner" className="font-medium text-zinc-900">
                Dashboard
              </Link>
              <Link href="/partner/logs" className="font-medium text-zinc-900">
                Logs
              </Link>
              <Link href="/partner/reports" className="font-medium text-zinc-900">
                Review
              </Link>
              <Link href="/partner/locations" className="font-medium text-zinc-900">
                Locations
              </Link>
              <Link href="/partner/assets" className="font-medium text-zinc-900">
                Assets
              </Link>
            </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Department</p>
            {shell.departments.length > 1 ? (
              <PartnerDepartmentSwitch
                departments={shell.departments}
                activeDepartmentId={shell.context.activeDepartmentId}
              />
            ) : (
              <p className="mt-1 text-zinc-800">{active?.name ?? "Department"}</p>
            )}
          </div>
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
