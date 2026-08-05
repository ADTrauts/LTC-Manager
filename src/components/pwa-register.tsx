"use client";

import { useEffect } from "react";

/**
 * Registers the Phase 6A service worker. Safe no-op when unsupported.
 * Does not cache authenticated HTML; the SW itself enforces the allowlist.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (cancelled) return;
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      } catch {
        // Unsupported or blocked — online app continues without installable offline shell.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
