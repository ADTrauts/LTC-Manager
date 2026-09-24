"use client";

import { useEffect } from "react";

/**
 * Registers the Phase 6A service worker in production only.
 * In development, a leftover worker cache-firsts `/_next/static/` chunks and
 * serves a stale client bundle against fresh SSR HTML — hydration mismatches.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    (async () => {
      try {
        if (process.env.NODE_ENV !== "production") {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((reg) => reg.unregister()));
          return;
        }

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
