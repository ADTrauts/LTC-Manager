"use client";

import Link from "next/link";

import { useNavPathname } from "@/hooks/use-nav-pathname";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";
import {
  PRODUCT_MODE_LABELS,
  resolveProductModeForPath,
  type ProductMode,
} from "@/lib/product-mode";

type ModeLink = {
  mode: ProductMode;
  href: string;
  testId: string;
};

type ShellModeNavProps = {
  runHomeHref: string;
  showBuild: boolean;
  showAdmin: boolean;
  onNavigate?: () => void;
};

function modeItemClass(active: boolean, mode: ProductMode) {
  if (active && mode === "BUILD") {
    return "bg-orange-500 text-white hover:bg-orange-500";
  }
  if (active && mode === "RUN") {
    return "bg-teal-700 text-white hover:bg-teal-700";
  }
  if (active) {
    return "bg-zinc-100 text-zinc-900";
  }
  return "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900";
}

export function ShellModeNav({
  runHomeHref,
  showBuild,
  showAdmin,
  onNavigate,
}: ShellModeNavProps) {
  const pathname = useNavPathname() ?? "/";
  const activeMode = resolveProductModeForPath(pathname);

  const links: ModeLink[] = [
    { mode: "RUN", href: runHomeHref, testId: "shell-mode-run" },
    ...(showBuild ? [{ mode: "BUILD" as const, href: "/build", testId: "shell-mode-build" }] : []),
    ...(showAdmin ? [{ mode: "ADMIN" as const, href: "/admin", testId: "shell-mode-admin" }] : []),
  ];

  if (links.length <= 1 && !showBuild && !showAdmin) {
    return null;
  }

  return (
    <nav aria-label="Mode" data-testid="shell-mode-nav">
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        Mode
      </p>
      <ul className="space-y-0.5">
        {links.map((link) => {
          const active = link.mode === activeMode;
          return (
            <li key={link.mode}>
              <Link
                href={link.href}
                data-testid={link.testId}
                data-mode={link.mode}
                data-mode-active={active ? "true" : undefined}
                aria-current={active ? "true" : undefined}
                onClick={() => onNavigate?.()}
                className={`flex min-h-11 items-center justify-between rounded-md px-3 py-2 text-sm font-medium ${modeItemClass(active, link.mode)} ${FOCUS_RING_CLASS}`}
              >
                <span className="inline-flex items-center gap-2">
                  {active ? (
                    <span aria-hidden>✓</span>
                  ) : (
                    <span className="inline-block w-3" aria-hidden />
                  )}
                  {PRODUCT_MODE_LABELS[link.mode]}
                </span>
                {active ? (
                  <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                    Current
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
