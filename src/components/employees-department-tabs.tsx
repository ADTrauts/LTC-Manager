"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useNavSearchParams } from "@/hooks/use-nav-pathname";

type TabDept = { id: string; name: string };

function tabClass(isActive: boolean) {
  return isActive
    ? "rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
    : "rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50";
}

function buildHref(
  pathname: string,
  searchParams: { toString(): string },
  nextDept: string | null,
  allowedIds: Set<string>,
) {
  const p = new URLSearchParams(searchParams.toString());
  if (nextDept && allowedIds.has(nextDept)) {
    p.set("dept", nextDept);
  } else {
    p.delete("dept");
  }
  const q = p.toString();
  return q ? `${pathname}?${q}` : pathname;
}

const EMPTY_SEARCH = new URLSearchParams();

export function EmployeesDepartmentTabs({ departments }: { departments: TabDept[] }) {
  const pathname = usePathname();
  const searchParams = useNavSearchParams();
  const allowedIds = new Set(departments.map((d) => d.id));
  const raw = searchParams?.get("dept") ?? null;
  const activeDept = raw && allowedIds.has(raw) ? raw : null;
  // Until mount, omit current query so SSR/client hrefs match; dept targets still set explicitly.
  const paramsForHref = searchParams ?? EMPTY_SEARCH;

  if (departments.length === 0) {
    return null;
  }

  const basePath = pathname ?? "/employees";

  return (
    <nav
      className="flex w-max max-w-full flex-wrap items-center gap-2 border-b border-zinc-200 pb-3"
      aria-label="Department"
    >
      <Link
        href={buildHref(basePath, paramsForHref, null, allowedIds)}
        className={`shrink-0 ${tabClass(searchParams !== null && activeDept === null)}`}
      >
        All departments
      </Link>
      {departments.map((d) => (
        <Link
          key={d.id}
          href={buildHref(basePath, paramsForHref, d.id, allowedIds)}
          className={`shrink-0 ${tabClass(activeDept === d.id)}`}
        >
          {d.name}
        </Link>
      ))}
    </nav>
  );
}
