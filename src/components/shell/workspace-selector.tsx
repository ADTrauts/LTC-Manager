"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import { CurrentWorkspaceRegion } from "@/components/shell/current-workspace-region";
import type { CurrentContextPresentation } from "@/lib/available-contexts/current-presentation";
import {
  filterWorkspacePresentations,
  groupWorkspaceSelectorPresentations,
  workspaceRowAccessibleName,
  workspaceRowProvenance,
  workspaceSelectorCanSwitch,
} from "@/lib/available-contexts/selector-groups";
import type { AvailableContextPresentation } from "@/lib/available-contexts/types";
import { AppIcons } from "@/lib/design-system";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

type WorkspaceSelectorProps = {
  current: CurrentContextPresentation | null;
  currentContextKey: string | null;
  items: readonly AvailableContextPresentation[];
  compact?: boolean;
};

type OverlayKind = "popover" | "sheet" | "fullscreen";

function useOverlayKind(): OverlayKind {
  const [kind, setKind] = useState<OverlayKind>("popover");
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const tablet = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      if (desktop.matches) setKind("popover");
      else if (tablet.matches) setKind("sheet");
      else setKind("fullscreen");
    };
    sync();
    desktop.addEventListener("change", sync);
    tablet.addEventListener("change", sync);
    return () => {
      desktop.removeEventListener("change", sync);
      tablet.removeEventListener("change", sync);
    };
  }, []);
  return kind;
}

function WorkspaceRow({
  item,
  isCurrent,
}: {
  item: AvailableContextPresentation;
  isCurrent: boolean;
}) {
  const via = workspaceRowProvenance(item);
  const name = workspaceRowAccessibleName(item);
  const body = (
    <>
      <span className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 w-4 shrink-0 text-zinc-900" aria-hidden>
          {isCurrent ? "✓" : ""}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-zinc-900 break-words">{item.title}</span>
          <span className="block text-xs text-zinc-600">{item.roleLabel}</span>
          {via ? <span className="block text-xs text-zinc-500">via {via}</span> : null}
        </span>
      </span>
      {isCurrent ? (
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Current
        </span>
      ) : null}
    </>
  );

  if (isCurrent) {
    return (
      <div
        role="option"
        aria-selected="true"
        aria-current="true"
        data-testid="workspace-selector-row"
        data-context-key={item.contextKey}
        data-context-kind={item.kind}
        data-current="true"
        className="flex min-h-11 items-center justify-between gap-3 rounded-md bg-zinc-50 px-2 py-2"
      >
        <span className="sr-only">{name}. Current workspace.</span>
        <span aria-hidden className="flex w-full items-center justify-between gap-3">
          {body}
        </span>
      </div>
    );
  }

  return (
    <form action="/access/enter" method="post">
      <input type="hidden" name="contextKey" value={item.contextKey} />
      <button
        type="submit"
        role="option"
        aria-selected="false"
        aria-label={name}
        data-testid="workspace-selector-row"
        data-context-key={item.contextKey}
        data-context-kind={item.kind}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-zinc-100 ${FOCUS_RING_CLASS}`}
      >
        <span className="sr-only">Switch to {name}</span>
        {body}
      </button>
    </form>
  );
}

function SelectorPanel({
  items,
  currentContextKey,
  onClose,
  headingId,
}: {
  items: readonly AvailableContextPresentation[];
  currentContextKey: string | null;
  onClose: () => void;
  headingId: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = filterWorkspacePresentations(items, query);
  const groups = groupWorkspaceSelectorPresentations(filtered);
  const SearchIcon = AppIcons.search;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 px-4 pb-3 pt-4">
        <h2 id={headingId} className="text-base font-semibold text-zinc-900">
          Switch workspace
        </h2>
        <label className="block">
          <span className="sr-only">Search workspaces</span>
          <span className="flex min-h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3">
            <SearchIcon className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search workspaces..."
              data-testid="workspace-selector-search"
              data-workspace-initial-focus
              className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
            />
          </span>
        </label>
      </div>
      <div
        role="listbox"
        aria-labelledby={headingId}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      >
        {groups.length === 0 ? (
          <p className="px-3 py-4 text-sm text-zinc-600">No workspaces match that search.</p>
        ) : (
          groups.map((entry) => (
            <section key={entry.group} className="mb-3">
              <h3 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {entry.group}
              </h3>
              <div className="space-y-0.5">
                {entry.items.map((item) => (
                  <WorkspaceRow
                    key={item.contextKey}
                    item={item}
                    isCurrent={item.contextKey === currentContextKey}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
      <div className="shrink-0 border-t border-zinc-200 px-4 py-3">
        <Link
          href="/access"
          data-testid="workspace-selector-my-access"
          onClick={onClose}
          className={`block text-sm font-medium text-zinc-800 underline-offset-2 hover:underline ${FOCUS_RING_CLASS}`}
        >
          View My Access
        </Link>
      </div>
    </div>
  );
}

function Overlay({
  kind,
  open,
  onClose,
  labelledBy,
  anchorRef,
  children,
}: {
  kind: OverlayKind;
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  anchorRef: RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [popoverBox, setPopoverBox] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const syncPopover = () => {
      const anchor = anchorRef.current;
      if (!anchor || kind !== "popover") return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 22 * 16), Math.min(28 * 16, window.innerWidth - 16));
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setPopoverBox({ top: Math.min(rect.bottom + 4, window.innerHeight - 16), left, width });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", syncPopover);
    window.addEventListener("scroll", syncPopover, true);
    syncPopover();
    const previousOverflow = document.body.style.overflow;
    if (kind !== "popover") document.body.style.overflow = "hidden";
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
    const focusTimer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>("[data-workspace-initial-focus]")
        ?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("pointerup", arm, true);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onArmedPointerDown, true);
      window.removeEventListener("resize", syncPopover);
      window.removeEventListener("scroll", syncPopover, true);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus?.();
    };
  }, [open, onClose, kind, anchorRef]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      data-testid="workspace-selector-panel"
      data-workspace-surface={kind}
      style={
        kind === "popover"
          ? {
              position: "fixed",
              top: popoverBox?.top ?? 56,
              left: popoverBox?.left ?? 8,
              width: popoverBox?.width ?? 22 * 16,
            }
          : undefined
      }
      className={
        kind === "popover"
          ? "z-[80] flex max-h-[min(32rem,calc(100dvh-2rem))] flex-col overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg"
          : kind === "sheet"
            ? "relative z-[80] flex max-h-[min(40rem,90dvh)] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
            : "relative z-[80] flex h-dvh w-full flex-col overflow-hidden bg-white"
      }
    >
      {kind !== "popover" ? (
        <div className="flex justify-end px-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className={`min-h-10 rounded-md px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 ${FOCUS_RING_CLASS}`}
          >
            Close
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );

  return createPortal(
    kind === "popover" ? (
      panel
    ) : (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 md:p-6">
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          aria-label="Close"
          onClick={onClose}
        />
        {panel}
      </div>
    ),
    document.body,
  );
}

export function WorkspaceSelector({
  current,
  currentContextKey,
  items,
  compact = false,
}: WorkspaceSelectorProps) {
  const headingId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const overlay = useOverlayKind();
  const canSwitch = workspaceSelectorCanSwitch(items, currentContextKey);

  if (!current && items.length === 0) return null;

  const closed = (
    <CurrentWorkspaceRegion current={current} compact={compact} announce={!canSwitch} />
  );

  if (!canSwitch) {
    return (
      <div data-testid="workspace-selector" data-workspace-static="true">
        {closed}
      </div>
    );
  }

  const label = current
    ? `Switch workspace. Current workspace: ${current.title}. ${current.subtitle}`
    : "Switch workspace";

  return (
    <div
      ref={rootRef}
      className="relative w-fit min-w-0 max-w-[11rem] sm:max-w-[14rem] xl:max-w-[22rem]"
      data-testid="workspace-selector"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        data-testid="workspace-selector-trigger"
        onClick={() => setOpen((value) => !value)}
        className={`flex min-w-0 max-w-[11rem] items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-zinc-50 sm:max-w-[14rem] xl:max-w-[22rem] xl:px-1.5 xl:py-1 ${FOCUS_RING_CLASS}`}
      >
        <span className="min-w-0 flex-1">{closed}</span>
        <AppIcons.chevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
      </button>
      <Overlay
        kind={overlay}
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={headingId}
        anchorRef={rootRef}
      >
        <SelectorPanel
          items={items}
          currentContextKey={currentContextKey}
          onClose={() => setOpen(false)}
          headingId={headingId}
        />
      </Overlay>
    </div>
  );
}
