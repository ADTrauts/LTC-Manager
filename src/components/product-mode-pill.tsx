"use client";

import Link from "next/link";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { BUILD_HUB_HOME_HREF } from "@/lib/build-hub";
import {
  PRODUCT_MODE_LABELS,
  PRODUCT_MODE_TAGLINES,
  resolveProductModeForPath,
  type ProductMode,
} from "@/lib/product-mode";

type ProductModePillProps = {
  /** Canonical RUN home for this session. */
  runHomeHref: string;
  /** Whether Build is reachable for this session. Presentation only. */
  showBuild: boolean;
};

/**
 * Persistent Run/Build mode pill in the global header.
 *
 * Locked visual contract:
 * - RUN = calming emerald (operate today)
 * - BUILD = intense orange (configure / construction)
 *
 * Switching navigates to the other mode's home. Hidden when Build is not available (Run-only sessions).
 */
export function ProductModePill({ runHomeHref, showBuild }: ProductModePillProps) {
  const pathname = useNavPathname();
  if (!showBuild || !pathname) return null;

  const mode = resolveProductModeForPath(pathname);
  if (mode === "ADMIN") return null;

  const isBuild = mode === "BUILD";
  const href = isBuild ? runHomeHref : BUILD_HUB_HOME_HREF;
  const label = PRODUCT_MODE_LABELS[mode];
  const switchTo: ProductMode = isBuild ? "RUN" : "BUILD";

  return (
    <Link
      href={href}
      data-testid="product-mode-pill"
      data-product-mode={mode}
      title={`${PRODUCT_MODE_TAGLINES[mode]} — switch to ${PRODUCT_MODE_LABELS[switchTo]}`}
      aria-label={`Current mode ${label}. Switch to ${PRODUCT_MODE_LABELS[switchTo]}.`}
      className={
        isBuild
          ? "inline-flex min-h-8 items-center rounded-md bg-orange-500 px-2.5 text-xs font-bold uppercase tracking-[0.08em] text-white shadow-sm hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
          : "inline-flex min-h-8 items-center rounded-md bg-emerald-700 px-2.5 text-xs font-bold uppercase tracking-[0.08em] text-white shadow-sm hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      }
    >
      {label}
    </Link>
  );
}
