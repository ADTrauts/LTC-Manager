"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Pathname safe for nav active-state styling after hydration.
 * Returns null on SSR and the first client paint so server HTML matches the client;
 * then the real pathname so active tabs update without hydration mismatches.
 * (Also avoids brief HMR drift where SSR HTML predates the latest client bundle.)
 */
export function useNavPathname(): string | null {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted ? pathname : null;
}
