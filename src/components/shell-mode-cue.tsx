"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ShellModeNav } from "@/components/shell/shell-mode-nav";
import { useNavPathname } from "@/hooks/use-nav-pathname";
import { AppIcons } from "@/lib/design-system";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import {
  PRODUCT_MODE_LABELS,
  PRODUCT_MODE_TAGLINES,
  resolveProductModeForPath,
} from "@/lib/product-mode";

export const OPEN_ACCOUNT_MENU_EVENT = "ltc-open-account-menu";

type ShellModeCueProps = {
  runHomeHref?: string;
  showBuild?: boolean;
  showAdmin?: boolean;
};

function cueClass(mode: "RUN" | "BUILD" | "ADMIN") {
  if (mode === "BUILD") {
    return "border-orange-500 bg-orange-500 text-white";
  }
  if (mode === "RUN") {
    return "border-teal-700 bg-teal-700 text-white";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

/**
 * Compact header Mode control. Closed: RUN / BUILD / ADMIN. Open: authorized modes.
 * Mode switching never lives in the account menu.
 */
export function ShellModeCue({
  runHomeHref,
  showBuild = false,
  showAdmin = false,
}: ShellModeCueProps) {
  const pathname = useNavPathname();
  const mode = resolveProductModeForPath(pathname ?? "/");
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  const canSwitch = Boolean(runHomeHref) && (showBuild || showAdmin);
  const label = `Current mode: ${PRODUCT_MODE_LABELS[mode]}`;

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const sync = () => {
      const anchor = rootRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = 16 * 16;
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
      setBox({ top: Math.min(rect.bottom + 4, window.innerHeight - 16), left });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    sync();
    // Arm after the opening pointerup so the same gesture cannot dismiss the panel.
    let armed = false;
    const arm = () => {
      armed = true;
    };
    const onArmedPointerDown = (event: PointerEvent) => {
      if (!armed) return;
      onPointerDown(event);
    };
    window.addEventListener("pointerup", arm, true);
    document.addEventListener("pointerdown", onArmedPointerDown, true);
    return () => {
      window.removeEventListener("pointerup", arm, true);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onArmedPointerDown, true);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      previousFocus.current?.focus?.();
    };
  }, [open]);

  const closedClass = `inline-flex min-h-10 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] font-semibold uppercase tracking-wider sm:px-2 ${cueClass(mode)} ${FOCUS_RING_CLASS}`;

  if (!canSwitch || !runHomeHref) {
    return (
      <p
        data-testid="shell-mode-cue"
        data-product-mode={mode}
        title={`${PRODUCT_MODE_LABELS[mode]} — ${PRODUCT_MODE_TAGLINES[mode]}`}
        aria-label={label}
        className={closedClass}
      >
        {PRODUCT_MODE_LABELS[mode]}
      </p>
    );
  }

  return (
    <div ref={rootRef} className="relative" data-testid="shell-mode-cue" data-product-mode={mode}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${label}. Switch mode`}
        title={`${PRODUCT_MODE_LABELS[mode]} — ${PRODUCT_MODE_TAGLINES[mode]}`}
        data-testid="shell-mode-picker-trigger"
        onClick={() => setOpen((value) => !value)}
        className={closedClass}
      >
        {PRODUCT_MODE_LABELS[mode]}
        <AppIcons.chevronDown className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Mode"
              data-testid="shell-mode-picker-panel"
              style={{
                position: "fixed",
                top: box?.top ?? 56,
                left: box?.left ?? Math.max(8, window.innerWidth - 16 * 16 - 8),
                width: "16rem",
              }}
              className="z-[80] overflow-hidden rounded-md border border-zinc-200 bg-white py-2 shadow-lg"
            >
              <ShellModeNav
                runHomeHref={runHomeHref}
                showBuild={showBuild}
                showAdmin={showAdmin}
                onNavigate={() => setOpen(false)}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
