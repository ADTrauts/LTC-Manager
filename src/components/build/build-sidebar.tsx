"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { BuildSidebarNavItem } from "@/lib/build-hub";
import { BUILD_HUB_HOME_HREF } from "@/lib/build-hub";
import { resolveNavIcon } from "@/lib/design-system";
import { isActiveNavPath } from "@/lib/nav-utils";
import { PRODUCT_MODE_LABELS } from "@/lib/product-mode";

function buildSidebarLinkClass(isActive: boolean) {
  return isActive
    ? "flex min-h-11 items-center gap-2.5 rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white"
    : "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-orange-100 hover:text-orange-950";
}

function isBuildNavActive(pathname: string, href: string): boolean {
  // Build Home is exact-only so child builders never light up the hub link.
  if (href === BUILD_HUB_HOME_HREF) {
    return pathname === BUILD_HUB_HOME_HREF;
  }
  return isActiveNavPath(pathname, href);
}

type BuildSidebarProps = {
  items: readonly BuildSidebarNavItem[];
  presentation?: "rail" | "panel";
  onNavigate?: () => void;
};

/**
 * BUILD-mode navigation — same items for desktop rail and compact drawer.
 */
export function BuildSidebar({
  items,
  presentation = "rail",
  onNavigate,
}: BuildSidebarProps) {
  const pathname = usePathname() ?? "/";

  const nav = (
    <nav className="space-y-0.5" aria-label="Build tools">
      {items.length === 0 ? (
        <p className="px-3 py-2 text-sm text-zinc-500" role="status">
          No Build tools available.
        </p>
      ) : (
        items.map((item) => {
          const isActive = isBuildNavActive(pathname, item.href);
          const Icon = resolveNavIcon(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={buildSidebarLinkClass(isActive)}
              aria-current={isActive ? "page" : undefined}
              data-testid="build-sidebar-link"
              data-href={item.href}
              data-active={isActive ? "true" : "false"}
              onClick={() => onNavigate?.()}
            >
              {Icon ? (
                <Icon
                  className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-zinc-500"}`}
                  aria-hidden
                />
              ) : null}
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })
      )}
    </nav>
  );

  if (presentation === "panel") {
    return (
      <div data-testid="build-nav-panel" className="space-y-2">
        {nav}
      </div>
    );
  }

  return (
    <aside
      className="hidden w-72 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white xl:block xl:min-h-0"
      aria-label="Build navigation"
      data-testid="build-sidebar"
      data-shell-region="sidebar"
    >
      <div className="flex flex-col gap-6 p-4 lg:px-4 lg:py-5">
        <section aria-label="Builders">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-orange-800">
            {PRODUCT_MODE_LABELS.BUILD}
          </h2>
          {nav}
        </section>
      </div>
    </aside>
  );
}
