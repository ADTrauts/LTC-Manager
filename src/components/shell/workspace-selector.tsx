"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";

import { enterContextAction } from "@/app/access/actions";
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

function useCompactOverlay(): Exclude<OverlayKind, "popover"> {
  const [kind, setKind] = useState<Exclude<OverlayKind, "popover">>("fullscreen");
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setKind(media.matches ? "sheet" : "fullscreen");
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return kind;
}

function SwitchSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <span className="sr-only" aria-live="polite">
      {pending ? "Switching workspace" : label}
    </span>
  );
}

function WorkspaceRow({
  item,
  isCurrent,
  onClose,
}: {
  item: AvailableContextPresentation;
  isCurrent: boolean;
  onClose: () => void;
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
          <span className="block truncate text-sm font-semibold text-zinc-900">{item.title}</span>
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
    <form action={enterContextAction}>
      <input type="hidden" name="contextKey" value={item.contextKey} />
      <button
        type="submit"
        role="option"
        aria-selected="false"
        aria-label={name}
        data-testid="workspace-selector-row"
        data-context-key={item.contextKey}
        data-context-kind={item.kind}
        onClick={onClose}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-zinc-100 ${FOCUS_RING_CLASS}`}
      >
        <SwitchSubmit label={`Switch to ${name}`} />
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
                    onClose={onClose}
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
  children,
}: {
  kind: OverlayKind;
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    if (kind !== "popover") document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>("[data-workspace-initial-focus]")
        ?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus?.();
    };
  }, [open, onClose, kind]);

  if (!open) return null;

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      data-testid="workspace-selector-panel"
      data-workspace-surface={kind}
      className={
        kind === "popover"
          ? "absolute left-0 top-full z-50 mt-1 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg"
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

  if (kind === "popover") return panel;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 md:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      {panel}
    </div>,
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
  const compactOverlay = useCompactOverlay();
  const canSwitch = workspaceSelectorCanSwitch(items, currentContextKey);
  const overlay: OverlayKind = compact ? compactOverlay : "popover";

  useEffect(() => {
    if (!open || overlay !== "popover") return;
    function onPointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, overlay]);

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
    <div ref={rootRef} className="relative min-w-0" data-testid="workspace-selector">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        data-testid="workspace-selector-trigger"
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full min-w-0 items-center gap-2 rounded-md text-left hover:bg-zinc-50 ${FOCUS_RING_CLASS} ${
          compact ? "max-w-[11rem] px-1 py-0.5 sm:max-w-[14rem]" : "px-1 py-1"
        }`}
      >
        <span className="min-w-0 flex-1">{closed}</span>
        <AppIcons.chevronDown className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
      </button>
      <Overlay kind={overlay} open={open} onClose={() => setOpen(false)} labelledBy={headingId}>
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
