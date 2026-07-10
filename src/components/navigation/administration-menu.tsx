"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import {
  buildAdministrationMenuSections,
  isAdministrationMenuActive,
} from "@/lib/administration-nav";
import {
  ADMINISTRATION_MENU_GAP_PX,
  ADMINISTRATION_MENU_MIN_WIDTH_PX,
  computeFixedMenuPosition,
  type FixedMenuPosition,
} from "@/lib/administration-menu-position";
import { AppIcons, navIconClassName, resolveNavIcon, shadows, zIndex } from "@/lib/design-system";
import { isActiveNavPath } from "@/lib/nav-utils";
import type { NavRouteItem } from "@/lib/nav-zones";

type AdministrationMenuProps = {
  items: NavRouteItem[];
  /** Match primary top-nav link chrome. */
  triggerClassName: (isActive: boolean) => string;
};

export function AdministrationMenu({ items, triggerClassName }: AdministrationMenuProps) {
  const pathname = useNavPathname();
  const sections = buildAdministrationMenuSections(items);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<FixedMenuPosition | null>(null);

  const flatItems = sections.flatMap((section) => section.items);
  const menuActive = isAdministrationMenuActive(pathname, items);
  const [prevPathname, setPrevPathname] = useState(pathname);

  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (open) {
      setOpen(false);
    }
  }

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;

    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panelRef.current?.getBoundingClientRect();
    setPosition(
      computeFixedMenuPosition({
        triggerRect,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        menuSize: panelRect
          ? { width: panelRect.width, height: panelRect.height }
          : { width: ADMINISTRATION_MENU_MIN_WIDTH_PX, height: 280 },
        gapPx: ADMINISTRATION_MENU_GAP_PX,
        minWidthPx: ADMINISTRATION_MENU_MIN_WIDTH_PX,
      }),
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    // Second pass after paint so measured panel height can refine placement.
    const frame = requestAnimationFrame(() => updatePosition());
    return () => cancelAnimationFrame(frame);
  }, [open, updatePosition, sections.length]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function onReposition() {
      updatePosition();
    }

    const scroller = triggerRef.current?.closest(".shell-nav-scroller");
    scroller?.addEventListener("scroll", onReposition, { passive: true });
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      scroller?.removeEventListener("scroll", onReposition);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, updatePosition]);

  if (sections.length === 0) {
    return null;
  }

  function focusItemAt(index: number) {
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>("[data-admin-menuitem='true']");
    nodes?.[index]?.focus();
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => focusItemAt(0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => focusItemAt(Math.max(0, flatItems.length - 1)));
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const nodes = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>("[data-admin-menuitem='true']") ?? [],
    );
    if (nodes.length === 0) return;
    const currentIndex = nodes.findIndex((node) => node === document.activeElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = currentIndex < 0 ? 0 : (currentIndex + 1) % nodes.length;
      nodes[next]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = currentIndex < 0 ? nodes.length - 1 : (currentIndex - 1 + nodes.length) % nodes.length;
      nodes[next]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      nodes[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  const AdminIcon = AppIcons.administration;
  const Chevron = AppIcons.chevronDown;

  const panelStyle: CSSProperties | undefined = position
    ? {
        position: "fixed",
        top: position.top,
        left: position.left,
        minWidth: position.minWidth,
        zIndex: zIndex.dropdown,
        boxShadow: shadows.md,
      }
    : {
        position: "fixed",
        top: 0,
        left: 0,
        minWidth: ADMINISTRATION_MENU_MIN_WIDTH_PX,
        zIndex: zIndex.dropdown,
        boxShadow: shadows.md,
        visibility: "hidden",
      };

  const menuPanel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            aria-label="Administration"
            className="overflow-hidden rounded-md border border-zinc-200 bg-white py-1"
            style={panelStyle}
            onKeyDown={onMenuKeyDown}
          >
            {sections.map((section, sectionIndex) => (
              <div key={section.id} role="group" aria-label={section.label}>
                {sectionIndex > 0 ? <div className="my-1 border-t border-zinc-100" aria-hidden /> : null}
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                  {section.label}
                </p>
                <ul className="list-none p-0">
                  {section.items.map((item) => {
                    const isActive = isActiveNavPath(pathname, item.href);
                    const Icon = resolveNavIcon(item.href);
                    return (
                      <li key={item.href} role="none">
                        <Link
                          role="menuitem"
                          href={item.href}
                          data-admin-menuitem="true"
                          data-nav-active={isActive ? "true" : undefined}
                          aria-current={isActive ? "page" : undefined}
                          className={
                            isActive
                              ? "flex min-h-11 items-center gap-2 bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus-visible:bg-zinc-100"
                              : "flex min-h-11 items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:bg-zinc-50"
                          }
                          onClick={() => setOpen(false)}
                        >
                          {Icon ? <Icon className={navIconClassName(isActive)} aria-hidden /> : null}
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName(menuActive)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        data-nav-active={menuActive ? "true" : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onTriggerKeyDown}
      >
        <AdminIcon className={navIconClassName(menuActive)} aria-hidden />
        <span>Administration</span>
        <Chevron
          className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {menuPanel}
    </div>
  );
}
