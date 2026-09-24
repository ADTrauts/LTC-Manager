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

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type GuardedModalProps = {
  open: boolean;
  title: string;
  dirty: boolean;
  onClose: () => void;
  children: ReactNode;
  "data-testid"?: string;
};

/**
 * Centered modal that will not discard in-progress work without confirmation.
 * Escape, backdrop, and Cancel all go through the same leave guard.
 */
export function GuardedModal({
  open,
  title,
  dirty,
  onClose,
  children,
  "data-testid": dataTestId,
}: GuardedModalProps) {
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

  const requestClose = useCallback(() => {
    if (dirty) {
      const leave = window.confirm("Leave without saving? You will lose the information you entered.");
      if (!leave) return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        requestClose();
        return;
      }
      trapFocus(event);
    };
    window.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred =
        panel.querySelector<HTMLElement>("[data-modal-initial-focus]") ??
        panel.querySelector<HTMLElement>(FOCUSABLE);
      preferred?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, requestClose, trapFocus]);

  useEffect(() => {
    if (!open || !dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [open, dirty]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={dataTestId ?? "guarded-modal"}
    >
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/55"
        onClick={requestClose}
        aria-label="Close dialog"
        data-testid="guarded-modal-backdrop"
      />
      <div
        ref={panelRef}
        className="relative flex max-h-[min(52rem,100dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 sm:px-5">
          <h2 id={titleId} className="min-w-0 truncate text-base font-semibold text-zinc-900 sm:text-lg">
            {title}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className={`min-h-10 shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 ${FOCUS_RING_CLASS}`}
            data-testid="guarded-modal-cancel"
          >
            Cancel
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
