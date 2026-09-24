"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ActiveDepartmentRouteSync } from "@/components/active-department-route-sync";
import { DepartmentScopeSwitcher } from "@/components/department-scope-switcher";
import { resolveDepartmentBuilderEntryHref } from "@/lib/department-administration/builder-entry";

const NAV = [
  { href: "/admin/facility/builder", match: "/admin/facility/builder", label: "Facility Builder" },
  { href: "/admin/departments", match: "/admin/departments", label: "Department Builder" },
  { href: "/employees", match: "/employees", label: "Employees" },
  { href: "/assets", match: "/assets", label: "Assets" },
  { href: "/build/logs", match: "/build/logs", label: "Logs" },
] as const;

function navActive(pathname: string, match: string) {
  return pathname === match || pathname.startsWith(`${match}/`);
}

export function HarborWorkSessionShell({
  facilityId,
  facilityName,
  staffName,
  departments,
  selectedDepartmentId,
  children,
}: {
  facilityId: string;
  facilityName: string;
  staffName: string;
  departments: Array<{ id: string; name: string }>;
  selectedDepartmentId: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const customerHref = `/console/customers/${facilityId}`;
  const departmentBuilderHref = resolveDepartmentBuilderEntryHref(selectedDepartmentId);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
      <ActiveDepartmentRouteSync
        selectedDepartmentId={selectedDepartmentId}
        selectableDepartmentIds={departments.map((department) => department.id)}
      />
      <div
        className="shrink-0 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-950 sm:px-6"
        data-testid="harbor-work-banner"
        role="status"
      >
        <p className="font-semibold">Harbor work session</p>
        <p className="mt-0.5 text-amber-900">
          You are LTC Corp staff in {facilityName}. This is not a facility login.
        </p>
      </div>
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] bg-white px-4 py-2 sm:px-6">
        <p className="mr-2 text-sm font-semibold tracking-tight">Harbor · {facilityName}</p>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Work session">
          {NAV.map((item) => {
            const href = item.match === "/admin/departments" ? departmentBuilderHref : item.href;
            const active = navActive(pathname, item.match);
            return (
              <Link
                key={item.match}
                href={href}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  active
                    ? "bg-[var(--run-aside)] font-semibold text-[var(--run-aside-fg)]"
                    : "text-[var(--text-secondary)] hover:bg-zinc-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <DepartmentScopeSwitcher
            departments={departments}
            selectedDepartmentId={selectedDepartmentId}
            isFacilityAdministrator
          />
          <span className="text-xs text-[var(--text-muted)]">{staffName}</span>
          <Link
            href={customerHref}
            className="text-xs font-medium text-[var(--text-secondary)] underline-offset-2 hover:underline"
          >
            Customer
          </Link>
          <form action="/api/console/work-session/end" method="post">
            <button
              type="submit"
              className="rounded-md border border-[var(--border-strong)] bg-white px-3 py-1.5 text-xs font-semibold"
            >
              Exit facility
            </button>
          </form>
        </div>
      </header>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">{children}</main>
    </div>
  );
}
