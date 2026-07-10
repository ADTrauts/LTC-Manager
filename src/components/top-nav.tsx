"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AdministrationMenu } from "@/components/navigation/administration-menu";
import { useNavPathname } from "@/hooks/use-nav-pathname";
import { partitionTopNavItems } from "@/lib/administration-nav";
import { navIconClassName, resolveNavIcon } from "@/lib/design-system";
import { groupNavItemsByZone, shouldShowZoneHeading, type NavRouteItem } from "@/lib/nav-zones";
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
  const { primaryItems, administrationItems } = partitionTopNavItems(items);
  const groups = groupNavItemsByZone(primaryItems);
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

    const frame = requestAnimationFrame(() => {
      updateOverflow();
    });
    el.addEventListener("scroll", updateOverflow, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateOverflow) : null;
    observer?.observe(el);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", updateOverflow);
      observer?.disconnect();
    };
  }, [updateOverflow, items]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !pathname) return;

    const frame = requestAnimationFrame(() => {
      const active = el.querySelector<HTMLElement>('[data-nav-active="true"]');
      if (!active) return;

      active.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
      updateOverflow();
    });

    return () => cancelAnimationFrame(frame);
  }, [pathname, updateOverflow, items]);

  return (
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
        aria-label="Top navigation"
        tabIndex={0}
      >
        {groups.map((group, groupIndex) => {
          const showZoneHeading = shouldShowZoneHeading(group);

          return (
            <div
              key={group.zone}
              className="flex shrink-0 items-center gap-0.5 sm:gap-1"
              role="group"
              aria-label={group.label}
            >
              {groupIndex > 0 ? (
                <span
                  className="mx-1 hidden h-5 w-px shrink-0 bg-zinc-200 sm:mx-1.5 xl:block"
                  aria-hidden="true"
                />
              ) : null}
              {showZoneHeading ? (
                <span className="hidden shrink-0 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 xl:inline">
                  {group.label}
                </span>
              ) : null}
              {group.items.map((item) => {
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
            </div>
          );
        })}
        {administrationItems.length > 0 ? (
          <>
            {groups.length > 0 ? (
              <span
                className="mx-1 hidden h-5 w-px shrink-0 bg-zinc-200 sm:mx-1.5 xl:block"
                aria-hidden="true"
              />
            ) : null}
            <AdministrationMenu items={administrationItems} triggerClassName={linkClass} />
          </>
        ) : null}
      </nav>
    </div>
  );
}
