"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

const BUILDER_PREFIXES = ["/admin/facility/builder", "/assets/builder", "/build/departments/", "/admin/departments/"];

/** Keeps builder links inside setup and leaves Back to setup as the way out. */
export function SetupBuilderFrame({ active, children }: { active: boolean; children: ReactNode }) {
  const router = useRouter();
  if (!active) return children;
  return (
    <div
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const anchor = (event.target as Element | null)?.closest?.("a");
        if (!anchor) return;
        const raw = anchor.getAttribute("href");
        if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || /^https?:/i.test(raw)) return;
        const url = new URL(raw, window.location.origin);
        if (url.origin !== window.location.origin || url.pathname === "/setup") return;
        const stays = BUILDER_PREFIXES.some((prefix) => url.pathname === prefix.replace(/\/$/, "") || url.pathname.startsWith(prefix));
        if (!stays) {
          event.preventDefault();
          return;
        }
        if (url.searchParams.get("onboarding") === "workspace") return;
        event.preventDefault();
        url.searchParams.set("onboarding", "workspace");
        router.push(`${url.pathname}${url.search}`);
      }}
    >
      {children}
    </div>
  );
}
