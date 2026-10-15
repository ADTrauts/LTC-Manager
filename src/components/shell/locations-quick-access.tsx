"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { LeftSidebar } from "@/components/left-sidebar";
import { AppIcons } from "@/lib/design-system";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import type { ProjectedSidebarSection } from "@/lib/locations";
import type { SidebarUnit } from "@/lib/units";

/** On-demand hierarchy beside Locations; compact navigation expands it inline. */
export function LocationsQuickAccess({
  children,
  units,
  projectionSections,
  projectionUnavailable,
  lockedUnitId,
  onNavigate,
  compact = false,
}: {
  children: ReactNode;
  units?: SidebarUnit[];
  projectionSections?: readonly ProjectedSidebarSection[];
  projectionUnavailable?: boolean;
  lockedUnitId?: string;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);

  function clearHoverTimer() {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }

  function syncPosition() {
    const anchor = rootRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel || compact) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(352, window.innerWidth - 16);
    const height = Math.min(576, window.innerHeight - 16);
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8));
    const left = Math.max(8, Math.min(rect.right + 8, window.innerWidth - width - 8));
    Object.assign(panel.style, {
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${height}px`,
    });
  }

  function closePanel(returnFocus = false) {
    clearHoverTimer();
    if (compact) setOpen(false);
    else panelRef.current?.hidePopover();
    if (returnFocus) triggerRef.current?.focus();
  }

  function openPanel(focus = false) {
    clearHoverTimer();
    if (compact) setOpen(true);
    else {
      syncPosition();
      panelRef.current?.showPopover();
      if (focus) panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }

  function scheduleClose() {
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => {
      if (!panelRef.current?.contains(document.activeElement)) closePanel();
    }, 200);
  }

  useEffect(() => {
    return () => {
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open || compact) return;
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  });

  const hierarchy = (
    <LeftSidebar
      presentation="panel"
      units={units}
      projectionSections={projectionSections}
      projectionUnavailable={projectionUnavailable}
      lockedUnitId={lockedUnitId}
      onNavigate={() => {
        closePanel();
        onNavigate?.();
      }}
    />
  );

  return (
    <div
      ref={rootRef}
      onPointerEnter={(event) => {
        if (compact || event.pointerType !== "mouse") return;
        clearHoverTimer();
        hoverTimer.current = setTimeout(() => openPanel(), 180);
      }}
      onPointerLeave={compact ? undefined : scheduleClose}
      onBlur={(event) => {
        if (!compact && !event.currentTarget.contains(event.relatedTarget)) scheduleClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          closePanel(true);
        }
      }}
      onClickCapture={(event) => {
        if (
          event.target instanceof Element &&
          !event.target.closest("button") &&
          event.target.closest("a[href]")
        ) closePanel();
      }}
    >
      <div className="flex items-center gap-0.5">
        {children}
        <button
          ref={triggerRef}
          type="button"
          aria-label="Quick access to locations"
          aria-expanded={open}
          aria-controls={panelId}
          aria-haspopup={compact ? undefined : "dialog"}
          title="Quick access to locations"
          data-testid="locations-quick-access-trigger"
          onClick={(event) => {
            if (open) closePanel();
            else openPanel(event.detail === 0);
          }}
          className={`flex min-h-11 w-10 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 ${FOCUS_RING_CLASS}`}
        >
          <AppIcons.chevronDown
            className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`}
            aria-hidden
          />
        </button>
      </div>
      {compact ? (
        open ? (
          <div id={panelId} className="py-2" data-testid="locations-quick-access-panel">
            {hierarchy}
          </div>
        ) : null
      ) : (
        <div
          ref={panelRef}
          id={panelId}
          popover="auto"
          role="dialog"
          aria-label="Quick access to locations"
          data-testid="locations-quick-access-panel"
          onToggle={() => setOpen(panelRef.current?.matches(":popover-open") ?? false)}
          onPointerEnter={clearHoverTimer}
          onPointerLeave={scheduleClose}
          className="fixed inset-auto m-0 overflow-hidden rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2">
            <h2 className="text-sm font-semibold">Locations</h2>
            <button
              type="button"
              onClick={() => closePanel(true)}
              className={`min-h-10 rounded-md px-2 text-sm text-zinc-600 hover:bg-zinc-100 ${FOCUS_RING_CLASS}`}
            >
              Close
            </button>
          </div>
          <div
            className="overflow-y-auto overscroll-contain p-3"
            style={{ maxHeight: "calc(min(36rem, 100dvh - 1rem) - 3.75rem)" }}
          >
            {open ? hierarchy : null}
          </div>
        </div>
      )}
    </div>
  );
}
