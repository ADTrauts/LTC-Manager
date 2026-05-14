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

export function EmployeesSubNav({ role }: EmployeesSubNavProps) {
  const pathname = useNavPathname();

  if (!hasAtLeastRole(role, "MANAGER")) {
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

  return (
    <nav
      className="flex w-max max-w-full flex-wrap items-center gap-2 border-b border-zinc-200 pb-3"
      aria-label="Employees section"
    >
      <Link href="/employees" className={`shrink-0 ${tabClass(employeesActive)}`}>
        Employees
      </Link>
      <Link href="/employees/points-summary" className={`shrink-0 ${tabClass(pointsActive)}`}>
        Points
      </Link>
      <Link href="/employees/separations" className={`shrink-0 ${tabClass(separationsActive)}`}>
        Separations
      </Link>
      <Link href="/employees/chrc-report" className={`shrink-0 ${tabClass(chrcReportActive)}`}>
        CHRC
      </Link>
      <Link href="/employees/hr-audit" className={`shrink-0 ${tabClass(hrAuditActive)}`}>
        HR audit
      </Link>
      <Link href="/employees/import" className={`shrink-0 ${tabClass(importActive)}`}>
        Import
      </Link>
    </nav>
  );
}
