"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { navIconClassName, resolveNavIcon } from "@/lib/design-system";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import { isActiveNavPath } from "@/lib/nav-utils";

export type WorkspaceOwnedNavItem = {
  href: string;
  label: string;
};

function destIsActive(pathname: string, href: string): boolean {
  if (href === "/units") {
    return (
      isActiveNavPath(pathname, "/units") ||
      pathname === "/unit" ||
      pathname.startsWith("/unit/")
    );
  }
  if (href === "/partner/locations") {
    return isActiveNavPath(pathname, "/partner/locations");
  }
  return isActiveNavPath(pathname, href);
}

export function isFacilityLocationsPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname === "/units" ||
    pathname.startsWith("/units/") ||
    pathname === "/unit" ||
    pathname.startsWith("/unit/")
  );
}

type WorkspaceOwnedNavProps = {
  items: readonly WorkspaceOwnedNavItem[];
  label?: string;
  onNavigate?: () => void;
  renderItem?: (item: WorkspaceOwnedNavItem, link: ReactNode) => ReactNode;
};

export function WorkspaceOwnedNav({
  items,
  label = "Workspace navigation",
  onNavigate,
  renderItem,
}: WorkspaceOwnedNavProps) {
  const pathname = useNavPathname() ?? "/";

  if (items.length === 0) return null;

  return (
    <nav aria-label={label} data-testid="workspace-owned-nav">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = destIsActive(pathname, item.href);
          const Icon = resolveNavIcon(item.href);
          const link = (
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              data-nav-active={active ? "true" : undefined}
              onClick={() => onNavigate?.()}
              className={
                active
                  ? `flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white ${FOCUS_RING_CLASS}`
                  : `flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 ${FOCUS_RING_CLASS}`
              }
            >
              {Icon ? (
                <Icon
                  className={
                    active ? "h-4 w-4 shrink-0 text-white" : navIconClassName(false)
                  }
                  aria-hidden
                />
              ) : null}
              <span>{item.label}</span>
            </Link>
          );
          return (
            <li key={item.href}>
              {renderItem ? renderItem(item, link) : link}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
