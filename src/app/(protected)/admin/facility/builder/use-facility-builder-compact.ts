"use client";

import { useSyncExternalStore } from "react";

const COMPACT_QUERY = "(max-width: 1279px)";

function subscribe(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(COMPACT_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(COMPACT_QUERY).matches;
}

/** Desktop layout during SSR/hydration so markup matches; the store corrects after paint. */
function getServerSnapshot(): boolean {
  return false;
}

/** True when Facility Builder should use hierarchy → detail drawer (below xl / 1280px). */
export function useFacilityBuilderCompact(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
