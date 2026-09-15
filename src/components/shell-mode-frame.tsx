"use client";

import type { CSSProperties, ReactNode } from "react";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { resolveProductModeForPath } from "@/lib/product-mode";

/**
 * Outer shell frame that publishes the current product mode as `data-product-mode` on the shell
 * root. This is the single place BUILD-mode detection drives chrome styling: descendant CSS in
 * `globals.css` gives BUILD surfaces their restrained blue treatment (header, mode indicator). RUN
 * and ADMIN keep the neutral/brand treatment. Deriving from `resolveProductModeForPath` means no
 * BUILD-detection logic is duplicated across surfaces.
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
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-zinc-50"
      style={{ "--brand-accent": brandColor } as CSSProperties}
    >
      {children}
    </div>
  );
}
