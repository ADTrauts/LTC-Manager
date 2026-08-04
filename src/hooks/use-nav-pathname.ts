"use client";

import { useSyncExternalStore } from "react";
import { usePathname, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";

const subscribeToNothing = () => () => {};

/**
 * False during SSR and the hydrating render, true afterwards. Same gate the
 * previous mount effect provided, without a setState inside an effect.
 */
function useHasHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

/**
 * Pathname safe for nav active-state styling after hydration.
 * Returns null on SSR and the first client paint so server HTML matches the client;
 * then the real pathname so active tabs update without hydration mismatches.
 * (Also avoids brief HMR drift where SSR HTML predates the latest client bundle.)
 */
export function useNavPathname(): string | null {
  const pathname = usePathname();
  return useHasHydrated() ? pathname : null;
}

/**
 * Search params safe for hrefs / active state after hydration.
 * Same mount gate as `useNavPathname` — avoids mismatches when `dept` (or other
 * query values) differ between SSR HTML and the client router URL.
 */
export function useNavSearchParams(): ReadonlyURLSearchParams | null {
  const searchParams = useSearchParams();
  return useHasHydrated() ? searchParams : null;
}
