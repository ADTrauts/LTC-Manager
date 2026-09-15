"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { navIconClassName, resolveNavIcon } from "@/lib/design-system";
import type { NavRouteItem } from "@/lib/nav-zones";
import {
  groupNavItemsByMode,
  headerNavItemsForMode,
  resolveActiveMode,
} from "@/lib/product-mode";
import { isActiveNavPath } from "@/lib/nav-utils";

type TopNavProps = {
  items: NavRouteItem[];
};

function linkClass(isActive: boolean) {
  return isActive
    ? "inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 border-zinc-900 px-2 pb-px text-sm font-semibold text-zinc-900 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400 sm:px-2.5"
    : "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-sm px-2 text-sm font-medium text-zinc-600 outline-offset-2 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400 sm:px-2.5";
}

export function TopNav({ items }: TopNavProps) {
  const pathname = useNavPathname();
  const groups = useMemo(() => groupNavItemsByMode(items), [items]);
  const activeMode = resolveActiveMode(pathname ?? "", groups);

  const activeGroup = groups.find((group) => group.mode === activeMode) ?? groups[0];
  const visibleItems = useMemo(
    () => headerNavItemsForMode(activeMode, activeGroup?.items ?? []),
    [activeMode, activeGroup],
  );

  const scrollerRef = useRef<HTMLElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateOverflow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(maxScroll > 2 && el.scrollLeft < maxScroll - 2);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => updateOverflow());
    el.addEventListener("scroll", updateOverflow, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateOverflow) : null;
    observer?.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", updateOverflow);
      observer?.disconnect();
    };
  }, [updateOverflow, visibleItems]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !pathname) return;
    const frame = requestAnimationFrame(() => {
      const active = el.querySelector<HTMLElement>('[data-nav-active="true"]');
      if (!active) return;
      active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      updateOverflow();
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, updateOverflow, visibleItems]);

  if (groups.length === 0) return null;

  return (
    <div className="hidden min-w-0 flex-1 items-center gap-2 xl:flex sm:gap-3">
      <div className="relative min-w-0 flex-1">
        {canScrollLeft ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-white from-40% to-transparent"
            aria-hidden
          />
        ) : null}
        {canScrollRight ? (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white from-40% to-transparent"
            aria-hidden
          />
        ) : null}
        <nav
          ref={scrollerRef}
          className="shell-nav-scroller flex w-full min-w-0 flex-nowrap items-center gap-0.5 overflow-x-auto overscroll-x-contain scroll-smooth pb-0.5 sm:gap-1"
          style={{ scrollPaddingInline: "1rem" }}
          aria-label={`${activeGroup?.label ?? "Run"} navigation`}
          tabIndex={0}
        >
          {visibleItems.map((item) => {
            const isActive = isActiveNavPath(pathname, item.href);
            const Icon = resolveNavIcon(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass(isActive)}
                data-nav-active={isActive ? "true" : undefined}
                aria-current={isActive ? "page" : undefined}
              >
                {Icon ? <Icon className={navIconClassName(isActive)} aria-hidden /> : null}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
