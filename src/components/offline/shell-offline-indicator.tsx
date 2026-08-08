"use client";

import { useSyncExternalStore } from "react";

import { AppIcons } from "@/lib/design-system";

/**
 * Shell-level online/offline status chip.
 *
 * The operational runtime already surfaces per-panel sync state; this is the single, persistent
 * shell indicator the Build/Run IA promises. It subscribes to the browser `online`/`offline`
 * events via `useSyncExternalStore` (SSR-safe, no network calls) and stays invisible while
 * connectivity is healthy so it never adds chrome to the normal case. When offline it announces
 * politely via `role="status"` so tablet frontline users get an unmistakable, always-present cue.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

/** Assume online during SSR/first hydration so markup matches; the store corrects on the client. */
function getServerSnapshot(): boolean {
  return true;
}

export function ShellOfflineIndicator() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (online) {
    return null;
  }

  const OfflineIcon = AppIcons.warning;

  return (
    <span
      data-testid="shell-offline-indicator"
      data-online="false"
      role="status"
      aria-live="polite"
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800"
    >
      <OfflineIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>Offline</span>
    </span>
  );
}
