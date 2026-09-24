"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

export type DrawerSide = "left" | "right";
export type DrawerSize = "nav" | "md" | "lg";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  closeLabel?: string;
  /** Default right (forms). Left for shell navigation. */
  side?: DrawerSide;
  /** nav ≈ 20rem / 85vw; md/lg keep form drawer widths. */
  size?: DrawerSize;
  /** Extra panel classes (e.g. Build blue wash). */
  panelClassName?: string;
  "data-testid"?: string;
};

const SIZE_CLASS: Record<DrawerSize, string> = {
  nav: "w-[min(22rem,85vw)]",
  md: "w-full max-w-md",
  lg: "w-full max-w-2xl",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared overlay drawer — forms (right) and shell navigation (left).
 * Focus trap + Escape + backdrop + body scroll lock + return focus.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  closeLabel = "Close",
  side = "right",
  size = "lg",
  panelClassName = "",
  "data-testid": dataTestId,
}: DrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const trapFocus = useCallback((event: KeyboardEvent) => {
    if (event.key !== "Tab" || !panelRef.current) return;
    const nodes = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
    );
    if (nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const onKey = (e: KeyboardEvent) => {
      const focusInsidePanel =
        panelRef.current?.contains(document.activeElement) === true;
      if (!focusInsidePanel) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      trapFocus(e);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred =
        panel.querySelector<HTMLElement>("[data-drawer-initial-focus]") ??
        panel.querySelector<HTMLElement>(FOCUSABLE);
      preferred?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, trapFocus]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const sideClass =
    side === "left"
      ? "left-0 border-r border-zinc-200"
      : "right-0 border-l border-zinc-200";

  return createPortal(
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={dataTestId ?? "drawer"}
      data-drawer-side={side}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close"
        data-testid="drawer-backdrop"
      />
      <div
        ref={panelRef}
        className={`absolute inset-y-0 flex max-h-dvh flex-col bg-white shadow-lg ${sideClass} ${SIZE_CLASS[size]} ${panelClassName}`.trim()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-zinc-900 sm:text-lg">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`min-h-10 shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 ${FOCUS_RING_CLASS}`}
            data-testid="drawer-cancel"
            data-drawer-initial-focus
          >
            {closeLabel}
          </button>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
