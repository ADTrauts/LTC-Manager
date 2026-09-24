"use client";

import { useEffect } from "react";

export function SpaceWorkspaceFocus({ targetId }: { targetId: string | null }) {
  useEffect(() => {
    if (!targetId) return;
    document.getElementById(targetId)?.scrollIntoView({ block: "start" });
  }, [targetId]);
  return null;
}
