"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import {
  buildAdministrationMenuSections,
  isAdministrationMenuActive,
} from "@/lib/administration-nav";
import { AppIcons, navIconClassName, resolveNavIcon, shadows } from "@/lib/design-system";
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const flatItems = sections.flatMap((section) => section.items);
  const menuActive = isAdministrationMenuActive(pathname, items);
  const [prevPathname, setPrevPathname] = useState(pathname);

  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (open) {
      setOpen(false);
    }
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | PointerEvent) {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (!root.contains(event.target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (sections.length === 0) {
    return null;
  }

  function focusItemAt(index: number) {
    const root = rootRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>("[data-admin-menuitem='true']");
    const target = nodes[index];
    target?.focus();
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
      rootRef.current?.querySelectorAll<HTMLElement>("[data-admin-menuitem='true']") ?? [],
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

  return (
    <div ref={rootRef} className="relative shrink-0">
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

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Administration"
          className="absolute left-0 top-full z-50 mt-1 min-w-[16.5rem] overflow-hidden rounded-md border border-zinc-200 bg-white py-1"
          style={{ boxShadow: shadows.md }}
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
        </div>
      ) : null}
    </div>
  );
}
