"use client";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import {
  PRODUCT_MODE_LABELS,
  PRODUCT_MODE_TAGLINES,
  resolveProductAreaLabel,
  resolveProductModeForPath,
} from "@/lib/product-mode";

/**
 * Persistent mode + area breadcrumb. Tells the user, at a glance, whether they are operating (Run),
 * configuring (Build), or governing (Admin), and which area within that mode they are in.
 */
export function ShellZoneIndicator() {
  const pathname = useNavPathname();
  if (!pathname) {
    return (
      <div
        className="shrink-0 border-b border-zinc-200 bg-white px-3 py-1 sm:px-4 lg:px-6"
        aria-hidden="true"
      >
        <div className="h-3 w-36 rounded bg-zinc-100" />
      </div>
    );
  }

  const mode = resolveProductModeForPath(pathname);
  const modeLabel = PRODUCT_MODE_LABELS[mode];
  const areaLabel = resolveProductAreaLabel(pathname);

  return (
    <div className="shrink-0 border-b border-zinc-200 bg-white px-3 py-1 sm:px-4 lg:px-6">
      <p className="text-xs leading-none text-zinc-600" aria-label={`${modeLabel} mode`}>
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500"
          title={PRODUCT_MODE_TAGLINES[mode]}
          data-product-mode={mode}
        >
          {modeLabel}
        </span>
        {areaLabel ? (
          <>
            <span className="mx-1.5 text-zinc-300" aria-hidden="true">
              /
            </span>
            <span className="font-medium text-zinc-800">{areaLabel}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
