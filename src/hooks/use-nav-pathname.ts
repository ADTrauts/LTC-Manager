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
 * Current pathname for nav active-state and product-mode chrome.
 *
 * `usePathname()` is consistent across SSR and hydration in the App Router, so
 * Build pages render as BUILD on the server instead of a default RUN shell that
 * later swaps icons and mode attributes on the client.
 */
export function useNavPathname(): string | null {
  return usePathname();
}

/**
 * Search params safe for hrefs / active state after hydration.
 * Gated until mount — avoids mismatches when `dept` (or other
 * query values) differ between SSR HTML and the client router URL.
 */
export function useNavSearchParams(): ReadonlyURLSearchParams | null {
  const searchParams = useSearchParams();
  return useHasHydrated() ? searchParams : null;
}
