"use client";

import Link from "next/link";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { groupNavItemsByZone, type NavRouteItem } from "@/lib/nav-zones";

type TopNavProps = {
  items: NavRouteItem[];
};

function linkClass(isActive: boolean) {
  return isActive
    ? "app-accent-active rounded-md px-3 py-2 text-sm font-medium text-white"
    : "rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900";
}

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/employees") {
    return (
      pathname === "/employees" ||
      pathname.startsWith("/employees/import") ||
      pathname.startsWith("/employees/points-summary") ||
      pathname.startsWith("/employees/separations") ||
      pathname.startsWith("/employees/terminations") ||
      pathname.startsWith("/employees/chrc-report") ||
      pathname.startsWith("/employees/hr-audit")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav({ items }: TopNavProps) {
  const pathname = useNavPathname();
  const groups = groupNavItemsByZone(items);

  return (
    <nav
      className="flex w-max min-w-0 flex-nowrap items-center gap-3"
      aria-label="Top navigation"
    >
      {groups.map((group, groupIndex) => (
        <div
          key={group.zone}
          className="flex shrink-0 items-center gap-2"
          role="group"
          aria-label={group.label}
        >
          {groupIndex > 0 ? (
            <span
              className="mx-0.5 hidden h-4 w-px shrink-0 bg-zinc-200 sm:block"
              aria-hidden="true"
            />
          ) : null}
          <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 lg:inline">
            {group.label}
          </span>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 ${linkClass(isActivePath(pathname, item.href))}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
