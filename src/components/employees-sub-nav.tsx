"use client";

import Link from "next/link";

import { hasAtLeastRole, type AppRole } from "@/lib/access";
import { useNavPathname, useNavSearchParams } from "@/hooks/use-nav-pathname";

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
  { href: "/employees/points-summary", label: "Points", minRole: "STAFF" },
  { href: "/employees/separations", label: "Separations", minRole: "MANAGER" },
  { href: "/employees/chrc-report", label: "CHRC", minRole: "STAFF" },
  { href: "/employees/hr-audit", label: "HR audit", minRole: "MANAGER" },
  { href: "/employees/import", label: "Import", minRole: "MANAGER" },
];

export function EmployeesSubNav({ role }: EmployeesSubNavProps) {
  const pathname = useNavPathname();
  const searchParams = useNavSearchParams();
  const dept = searchParams?.get("dept") ?? null;

  function hrefWithDept(href: string) {
    if (!dept?.trim()) return href;
    return `${href}?dept=${encodeURIComponent(dept.trim())}`;
  }

  const items = SUB_NAV_ITEMS.filter((item) => hasAtLeastRole(role, item.minRole));
  if (items.length === 0) {
    return null;
  }

  const employeesActive = pathname !== null && pathname === "/employees";
  const pointsActive =
    pathname !== null &&
    (pathname === "/employees/points-summary" || pathname.startsWith("/employees/points-summary/"));
  const importActive =
    pathname !== null && (pathname === "/employees/import" || pathname.startsWith("/employees/import/"));
  const separationsActive =
    pathname !== null &&
    (pathname === "/employees/separations" ||
      pathname.startsWith("/employees/separations/") ||
      pathname === "/employees/terminations" ||
      pathname.startsWith("/employees/terminations/"));
  const chrcReportActive =
    pathname !== null && (pathname === "/employees/chrc-report" || pathname.startsWith("/employees/chrc-report/"));
  const hrAuditActive =
    pathname !== null && (pathname === "/employees/hr-audit" || pathname.startsWith("/employees/hr-audit/"));

  function isActiveForHref(href: string): boolean {
    if (pathname === null) return false;
    if (href === "/employees") return employeesActive;
    if (href === "/employees/points-summary") return pointsActive;
    if (href === "/employees/separations") return separationsActive;
    if (href === "/employees/chrc-report") return chrcReportActive;
    if (href === "/employees/hr-audit") return hrAuditActive;
    if (href === "/employees/import") return importActive;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav
      className="flex w-max max-w-full flex-wrap items-center gap-2 border-b border-zinc-200 pb-3"
      aria-label="Employees section"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={hrefWithDept(item.href)}
          className={`shrink-0 ${tabClass(isActiveForHref(item.href))}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
