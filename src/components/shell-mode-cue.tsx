"use client";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import {
  PRODUCT_MODE_LABELS,
  PRODUCT_MODE_TAGLINES,
  resolveProductModeForPath,
} from "@/lib/product-mode";

export const OPEN_ACCOUNT_MENU_EVENT = "ltc-open-account-menu";

/**
 * Calm compact mode cue in the shell header.
 * Click opens the existing account/workspace menu — not a second switcher.
 */
export function ShellModeCue() {
  const pathname = useNavPathname();
  const mode = resolveProductModeForPath(pathname ?? "/");
  const isBuild = mode === "BUILD";
  const isRun = mode === "RUN";

  return (
    <button
      type="button"
      data-testid="shell-mode-cue"
      data-product-mode={mode}
      title={`${PRODUCT_MODE_LABELS[mode]} — ${PRODUCT_MODE_TAGLINES[mode]}. Open workspace menu.`}
      aria-label={`Current workspace: ${PRODUCT_MODE_LABELS[mode]}. Open workspace and account menu.`}
      className={`inline-flex min-h-10 shrink-0 items-center rounded-md border px-1.5 text-[11px] font-semibold uppercase tracking-wider sm:px-2 ${FOCUS_RING_CLASS} ${
        isBuild
          ? "border-orange-500 bg-orange-500 text-white hover:bg-orange-600"
          : isRun
            ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
            : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
      }`}
      onClick={() => {
        window.dispatchEvent(new CustomEvent(OPEN_ACCOUNT_MENU_EVENT));
      }}
    >
      {PRODUCT_MODE_LABELS[mode]}
    </button>
  );
}
