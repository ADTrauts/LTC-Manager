"use client";

import Link from "next/link";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { BUILD_HUB_HOME_HREF } from "@/lib/build-hub";
import {
  PRODUCT_MODE_LABELS,
  PRODUCT_MODE_TAGLINES,
  resolveProductAreaLabel,
  resolveProductModeForPath,
} from "@/lib/product-mode";

/**
 * Persistent mode + area breadcrumb. Tells the user, at a glance, whether they are operating (Run),
 * configuring (Build), or governing (Admin), and which area within that mode they are in.
 *
 * Locked accents: Run = Harbor teal, Build = orange.
 * In BUILD the mode segment also links back to Build Home.
 */
export function ShellZoneIndicator() {
  const pathname = useNavPathname();
  if (!pathname) {
    return (
      <div
        className="shrink-0 border-b border-zinc-200 bg-white px-3 py-1 sm:px-4 lg:px-6"
        data-shell-region="mode-indicator"
        aria-hidden="true"
      >
        <div className="h-3 w-36 rounded bg-zinc-100" />
      </div>
    );
  }

  const mode = resolveProductModeForPath(pathname);
  const modeLabel = PRODUCT_MODE_LABELS[mode];
  const areaLabel = resolveProductAreaLabel(pathname);
  const isBuild = mode === "BUILD";
  const isRun = mode === "RUN";
  const onBuildHome = pathname === BUILD_HUB_HOME_HREF;

  const modeChipClass = isBuild
    ? "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] bg-orange-500 text-white"
    : isRun
      ? "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] bg-teal-700 text-white"
      : "text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500";

  return (
    <div
      className="shrink-0 border-b border-zinc-200 bg-white px-3 py-1 sm:px-4 lg:px-6"
      data-shell-region="mode-indicator"
    >
      <p
        className="flex flex-wrap items-center gap-x-0 text-xs leading-none text-zinc-600"
        aria-label={`${modeLabel} mode`}
      >
        {isBuild && !onBuildHome ? (
          <Link
            href={BUILD_HUB_HOME_HREF}
            className={`${modeChipClass} hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500`}
            title="Back to Build Home"
            data-product-mode={mode}
            data-testid="mode-indicator-build-home"
          >
            {modeLabel}
          </Link>
        ) : (
          <span
            className={modeChipClass}
            title={PRODUCT_MODE_TAGLINES[mode]}
            data-product-mode={mode}
          >
            {modeLabel}
          </span>
        )}
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
