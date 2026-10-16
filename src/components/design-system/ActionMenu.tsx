"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { constrainOverlayPosition } from "@/lib/design-system/overlay-position";

/** Portaled action menu with viewport containment, scrolling and keyboard navigation. */
export function ActionMenu({ x, y, label, onClose, children }: {
  x: number;
  y: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const position = () => {
      const rect = panel.getBoundingClientRect();
      const viewport = window.visualViewport;
      const box = constrainOverlayPosition({
        x, y, width: rect.width, height: panel.scrollHeight + 2,
        viewportWidth: viewport?.width ?? window.innerWidth,
        viewportHeight: viewport?.height ?? window.innerHeight,
      });
      Object.assign(panel.style, {
        left: `${box.left + (viewport?.offsetLeft ?? 0)}px`,
        top: `${box.top + (viewport?.offsetTop ?? 0)}px`,
        maxWidth: `${box.maxWidth}px`, maxHeight: `${box.maxHeight}px`,
      });
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
    };
  }, [x, y]);

  useEffect(() => {
    const panel = panelRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    triggerRef.current = previous;
    panel?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && panel?.contains(event.target)) return;
      closeRef.current();
    };
    // Scrolling the menu itself stays possible; moving its underlying anchor dismisses it.
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("scroll", dismiss, true);
      // Do not steal focus from a dialog opened by an action.
      if (document.activeElement === document.body || panel?.contains(document.activeElement)) {
        previous?.focus({ preventScroll: true });
      }
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={label}
      data-testid="action-menu"
      className="fixed z-[80] w-60 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
      style={{ left: x, top: y }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')];
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (event.key === "Escape") {
          event.preventDefault();
          closeRef.current();
        } else if (event.key === "Tab") {
          // Let the browser move to the control after/before the original trigger.
          triggerRef.current?.focus({ preventScroll: true });
          closeRef.current();
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }
      }}
    >
      {children}
    </div>, document.body,
  );
}
