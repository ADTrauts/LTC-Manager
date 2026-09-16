"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

export type SubNavItem = {
  id: string;
  label: string;
  href: string;
};

export type SubNavProps = {
  items: readonly SubNavItem[];
  activeId: string;
  /** Accessible name for the nav landmark. */
  "aria-label": string;
  className?: string;
  /** Optional trailing actions (e.g. Add). */
  end?: ReactNode;
  "data-testid"?: string;
};

/**
 * Canonical local horizontal navigation (tabs under a page header).
 * Square/md chips — not pills. Scrolls horizontally on narrow viewports
 * with edge fades when overflow exists.
 */
export function SubNav({
  items,
  activeId,
  "aria-label": ariaLabel,
  className = "",
  end,
  "data-testid": dataTestId,
}: SubNavProps) {
  const scrollerRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateOverflow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < max - 2);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(updateOverflow);
    el.addEventListener("scroll", updateOverflow, { passive: true });
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateOverflow) : null;
    observer?.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", updateOverflow);
      observer?.disconnect();
    };
  }, [updateOverflow, items]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      const active = el.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;
      active.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
      updateOverflow();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeId, updateOverflow, items]);

  return (
    <div
      className={`flex flex-nowrap items-center gap-2 border-b border-zinc-200 ${className}`.trim()}
      data-testid={dataTestId}
    >
      <div className="relative min-w-0 flex-1">
        {canScrollLeft ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-white from-30% to-transparent"
            aria-hidden
            data-testid="subnav-fade-left"
          />
        ) : null}
        {canScrollRight ? (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white from-30% to-transparent"
            aria-hidden
            data-testid="subnav-fade-right"
          />
        ) : null}
        <nav
          ref={scrollerRef}
          aria-label={ariaLabel}
          className="shell-nav-scroller -mb-px flex min-w-0 gap-0.5 overflow-x-auto overscroll-x-contain"
          style={{ scrollPaddingInline: "0.75rem" }}
        >
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-md px-3 py-2 text-sm transition-colors ${FOCUS_RING_CLASS} ${
                  active
                    ? "bg-zinc-900 font-medium text-white"
                    : "font-medium text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {end ? <div className="shrink-0 pb-1">{end}</div> : null}
    </div>
  );
}
