"use client";

import type { CSSProperties, ReactNode } from "react";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { resolveProductModeForPath } from "@/lib/product-mode";

/**
 * Outer shell frame that publishes the current product mode as `data-product-mode` on the shell
 * root. This is the single place mode detection drives chrome styling: descendant CSS in
 * `globals.css` applies locked Run (Harbor teal) and Build (orange) accents to header, mode
 * indicator, and sidebar. Deriving from `resolveProductModeForPath` means no mode-detection
 * logic is duplicated across surfaces.
 */
export function ShellModeFrame({
  brandColor,
  children,
}: {
  brandColor: string;
  children: ReactNode;
}) {
  const pathname = useNavPathname();
  const mode = resolveProductModeForPath(pathname ?? "/");

  return (
    <div
      data-shell-root
      data-product-mode={mode}
      className="flex h-dvh min-h-0 flex-col overflow-hidden"
      style={{ "--brand-accent": brandColor } as CSSProperties}
    >
      {children}
    </div>
  );
}
