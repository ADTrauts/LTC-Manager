"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { AppIcons, navIconClassName, resolveNavIcon } from "@/lib/design-system";
import type { NavRouteItem } from "@/lib/nav-zones";
import {
  groupNavItemsByMode,
  resolveActiveMode,
  type ProductMode,
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

/** Segmented Run / Build mode control. Each segment links to its mode's hub (first nav item). */
function ModeSwitch({
  segments,
  activeMode,
}: {
  segments: { mode: ProductMode; label: string; href: string }[];
  activeMode: ProductMode;
}) {
  if (segments.length < 2) return null;
  return (
    <div
      className="flex shrink-0 items-center rounded-md border border-zinc-200 bg-zinc-50 p-0.5"
      role="group"
      aria-label="Product mode"
    >
      {segments.map((segment) => {
        const isActive = segment.mode === activeMode;
        return (
          <Link
            key={segment.mode}
            href={segment.href}
            aria-current={isActive ? "true" : undefined}
            data-mode={segment.mode}
            data-mode-active={isActive ? "true" : undefined}
            className={
              isActive
                ? "inline-flex min-h-8 items-center rounded-[5px] bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400"
                : "inline-flex min-h-8 items-center rounded-[5px] px-3 text-sm font-medium text-zinc-500 hover:text-zinc-800 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400"
            }
          >
            {segment.label}
          </Link>
        );
      })}
    </div>
  );
}

export function TopNav({ items }: TopNavProps) {
  const pathname = useNavPathname();
  const groups = useMemo(() => groupNavItemsByMode(items), [items]);
  const activeMode = resolveActiveMode(pathname ?? "", groups);

  const primarySegments = groups
    .filter((group) => group.mode === "RUN" || group.mode === "BUILD")
    .map((group) => ({
      mode: group.mode,
      label: group.label,
      href: group.items[0]?.href ?? "/",
    }));

  const adminGroup = groups.find((group) => group.mode === "ADMIN");
  const activeGroup = groups.find((group) => group.mode === activeMode) ?? groups[0];
  const visibleItems = useMemo(
    () => (activeMode === "ADMIN" ? [] : activeGroup?.items ?? []),
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

  const AdminIcon = AppIcons.administration;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
      <ModeSwitch segments={primarySegments} activeMode={activeMode} />

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

      {adminGroup ? (
        <div className="flex shrink-0 items-center">
          <span className="mx-1 hidden h-5 w-px shrink-0 bg-zinc-200 sm:block" aria-hidden="true" />
          {adminGroup.items.map((item) => {
            const isActive = isActiveNavPath(pathname, item.href) || activeMode === "ADMIN";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={linkClass(isActive)}
                data-nav-active={isActive ? "true" : undefined}
                aria-current={isActiveNavPath(pathname, item.href) ? "page" : undefined}
              >
                <AdminIcon className={navIconClassName(isActive)} aria-hidden />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
