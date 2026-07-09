"use client";

import Link from "next/link";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { groupNavItemsByZone, shouldShowZoneHeading, type NavRouteItem } from "@/lib/nav-zones";
import { isActiveNavPath } from "@/lib/nav-utils";

type TopNavProps = {
  items: NavRouteItem[];
};

function linkClass(isActive: boolean) {
  return isActive
    ? "shrink-0 border-b-2 border-zinc-900 px-3 pb-2 pt-2 text-sm font-semibold text-zinc-900"
    : "shrink-0 rounded-sm px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900";
}

export function TopNav({ items }: TopNavProps) {
  const pathname = useNavPathname();
  const groups = groupNavItemsByZone(items);

  return (
    <nav
      className="flex w-max min-w-0 max-w-full flex-nowrap items-end gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:thin] sm:gap-3 [&::-webkit-scrollbar]:h-1.5"
      aria-label="Top navigation"
    >
      {groups.map((group, groupIndex) => {
        const showZoneHeading = shouldShowZoneHeading(group);

        return (
          <div
            key={group.zone}
            className="flex shrink-0 items-end gap-1 sm:gap-1.5"
            role="group"
            aria-label={group.label}
          >
            {groupIndex > 0 ? (
              <span
                className="mx-2 hidden h-5 w-px shrink-0 self-center bg-zinc-200 sm:mx-3 md:block"
                aria-hidden="true"
              />
            ) : null}
            {showZoneHeading ? (
              <span className="hidden shrink-0 px-1 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 md:inline">
                {group.label}
              </span>
            ) : null}
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
        );
      })}
    </nav>
  );
}
