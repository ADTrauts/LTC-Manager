"use client";

import Link from "next/link";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { groupNavItemsByZone, type NavRouteItem } from "@/lib/nav-zones";
import { isActiveNavPath } from "@/lib/nav-utils";

type TopNavProps = {
  items: NavRouteItem[];
};

function linkClass(isActive: boolean) {
  return isActive
    ? "shrink-0 border-b-2 border-zinc-900 px-2.5 pb-2 pt-2 text-sm font-semibold text-zinc-900"
    : "shrink-0 rounded-sm px-2.5 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900";
}

export function TopNav({ items }: TopNavProps) {
  const pathname = useNavPathname();
  const groups = groupNavItemsByZone(items);

  return (
    <nav
      className="flex w-max min-w-0 max-w-full flex-nowrap items-end gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:thin] sm:gap-2 [&::-webkit-scrollbar]:h-1.5"
      aria-label="Top navigation"
    >
      {groups.map((group, groupIndex) => (
        <div
          key={group.zone}
          className="flex shrink-0 items-end gap-0.5 sm:gap-1"
          role="group"
          aria-label={group.label}
        >
          {groupIndex > 0 ? (
            <span
              className="mx-1 hidden h-5 w-px shrink-0 self-center bg-zinc-200 sm:mx-2 md:block"
              aria-hidden="true"
            />
          ) : null}
          <span className="hidden shrink-0 px-1 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 md:inline">
            {group.label}
          </span>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(isActiveNavPath(pathname, item.href))}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
