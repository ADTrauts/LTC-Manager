"use client";

import { useEffect, useState } from "react";

function readCompact(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 1279px)").matches;
}

/** True when Facility Builder should use hierarchy → detail drawer (below xl / 1280px). */
export function useFacilityBuilderCompact(): boolean {
  const [compact, setCompact] = useState(readCompact);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1279px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return compact;
}
