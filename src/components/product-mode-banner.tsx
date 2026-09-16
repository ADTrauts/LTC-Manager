"use client";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { resolveProductModeForPath } from "@/lib/product-mode";

/**
 * Explicit Build-mode banner under the global header.
 * Reinforces that the user is configuring operations, not operating the day.
 */
export function ProductModeBanner() {
  const pathname = useNavPathname();
  if (!pathname || resolveProductModeForPath(pathname) !== "BUILD") return null;

  return (
    <div
      data-testid="product-mode-banner"
      data-shell-region="mode-banner"
      className="shrink-0 border-b border-orange-900/30 bg-[#3b1408] px-3 py-2 text-sm text-orange-50 sm:px-4 lg:px-6"
      role="status"
    >
      <span className="font-semibold">Build mode</span>
      <span className="mx-2 text-orange-300/80" aria-hidden>
        —
      </span>
      <span className="text-orange-100">
        Configuring how the facility works. Switch to Run when you are ready to operate today.
      </span>
    </div>
  );
}
