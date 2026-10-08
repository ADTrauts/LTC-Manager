import Link from "next/link";

import { leavePartnerFacilityAction, switchPartnerDepartmentAction } from "@/app/partner/actions";
import { partnerRoleLabel } from "@/lib/partner-user-access";
import type { PartnerFacilityShellModel } from "@/lib/partner-operational-context";

export function PartnerFacilityShell({
  shell,
  children,
}: {
  shell: PartnerFacilityShellModel;
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
          </div>
          <form action={leavePartnerFacilityAction}>
            <button type="submit" className="text-sm font-medium underline-offset-2 hover:underline">
              Return to {shell.partnerOrganizationName}
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto grid max-w-3xl gap-8 px-6 py-8 md:grid-cols-[12rem_1fr]">
        <nav className="space-y-4 text-sm" aria-label="Partner">
            <Link href="/partner" className="font-medium text-zinc-900">
              Partner Home
            </Link>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Department</p>
            {shell.departments.length > 1 ? (
              <form action={switchPartnerDepartmentAction} className="mt-2 space-y-2">
                <label className="block">
                  <span className="sr-only">Active department</span>
                  <select
                    name="departmentId"
                    defaultValue={shell.context.activeDepartmentId}
                    className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5"
                  >
                    {shell.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white"
                >
                  Switch
                </button>
              </form>
            ) : (
              <p className="mt-1 text-zinc-800">{active?.name ?? "Department"}</p>
            )}
          </div>
        </nav>
        <main data-testid="partner-holding">{children}</main>
      </div>
    </div>
  );
}

export function PartnerHomeStatus({ shell }: { shell: PartnerFacilityShellModel }) {
  const active = shell.departments.find((department) => department.id === shell.context.activeDepartmentId);
  return (
    <div className="space-y-4">
      <dl className="space-y-2 text-sm text-zinc-800">
        <div>
          <dt className="inline font-medium">Partner role </dt>
          <dd className="inline" data-testid="partner-effective-role">
            {partnerRoleLabel(shell.context.effectiveRole)}
          </dd>
        </div>
        <div>
          <dt className="inline font-medium">Active department </dt>
          <dd className="inline" data-testid="partner-active-department">
            {active?.name ?? "Department"}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Authorized departments</dt>
          <dd data-testid="partner-departments">
            <ul className="mt-1 list-disc pl-5">
              {shell.departments.map((department) => (
                <li key={department.id}>{department.name}</li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      <p className="text-sm text-zinc-700">Your partner access is active.</p>
      <p className="text-sm text-zinc-600">
        Operational screens will become available as they are enabled for partner access.
      </p>
    </div>
  );
}
