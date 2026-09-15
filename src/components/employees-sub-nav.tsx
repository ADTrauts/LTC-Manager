"use client";

import Link from "next/link";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import { useNavPathname } from "@/hooks/use-nav-pathname";

type EmployeesSubNavProps = {
  role: AppRole;
};

function tabClass(isActive: boolean) {
  return isActive
    ? "rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
    : "rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100";
}

const SUB_NAV_ITEMS: { href: string; label: string; minRole: AppRole }[] = [
  { href: "/employees", label: "Employees", minRole: "STAFF" },
  { href: "/employees/job-roles", label: "Job Roles", minRole: "MANAGER" },
];

export function EmployeesSubNav({ role }: EmployeesSubNavProps) {
  const pathname = useNavPathname();

  const items = SUB_NAV_ITEMS.filter((item) => hasAtLeastRole(role, item.minRole));
  if (items.length === 0) {
    return null;
  }

  const employeesActive = pathname !== null && pathname === "/employees";
  const jobRolesActive =
    pathname !== null &&
    (pathname === "/employees/job-roles" || pathname.startsWith("/employees/job-roles/"));

  function isActiveForHref(href: string): boolean {
    if (pathname === null) return false;
    if (href === "/employees") return employeesActive;
    if (href === "/employees/job-roles") return jobRolesActive;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav
      className="flex w-max max-w-full flex-wrap items-center gap-2 border-b border-zinc-200 pb-3"
      aria-label="Employees section"
      data-testid="employees-sub-nav"
    >
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={`shrink-0 ${tabClass(isActiveForHref(item.href))}`}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
