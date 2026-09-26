"use client";

import { useEffect } from "react";

const HASH_SECTIONS = new Set(["coverage", "evidence", "assets", "milestones"]);

export function SpaceWorkspaceFocus({ targetId }: { targetId: string | null }) {
  useEffect(() => {
    const resolveId = () => {
      const fromHash = window.location.hash.replace(/^#/, "").trim();
      return targetId || (HASH_SECTIONS.has(fromHash) ? fromHash : null);
    };
    const scroll = () => {
      const id = resolveId();
      if (!id) return false;
      const el = document.getElementById(id);
      if (!el) return false;
      el.scrollIntoView({ block: "start" });
      return true;
    };

    if (scroll()) return;
    const frames = [window.setTimeout(scroll, 0), window.setTimeout(scroll, 80)];
    window.addEventListener("hashchange", scroll);
    return () => {
      frames.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("hashchange", scroll);
    };
  }, [targetId]);
  return null;
}
