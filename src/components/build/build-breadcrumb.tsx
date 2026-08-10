import Link from "next/link";
import type { ReactNode } from "react";

import { AppIcons } from "@/lib/design-system";
import { BUILD_HUB_HOME_HREF } from "@/lib/build-hub";

export const BUILD_HOME_LABEL = "Build Home";
export const BACK_TO_BUILD_HOME_LABEL = "Back to Build Home";

/**
 * Shared BUILD child-page breadcrumb + return path.
 *
 * Every canonical BUILD surface renders this so the user can always get back to Build Home without
 * hunting through the global header. It is presentation only and adds no authority: the link simply
 * points at `/build`, which is itself authority-projected.
 */
export function BuildBreadcrumb({
  current,
  className = "",
}: {
  /** The area name for the current BUILD surface (e.g. "Asset Builder"). */
  current: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Build breadcrumb"
      className={`text-sm text-zinc-500 ${className}`.trim()}
      data-testid="build-breadcrumb"
    >
      <ol className="flex flex-wrap items-center gap-x-0">
        <li className="inline-flex items-center">
          <Link
            href={BUILD_HUB_HOME_HREF}
            data-testid="build-breadcrumb-home"
            className="inline-flex items-center gap-1 font-medium text-amber-800 hover:text-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          >
            <AppIcons.operationalMode className="h-3.5 w-3.5" aria-hidden />
            {BUILD_HOME_LABEL}
          </Link>
        </li>
        <li className="inline-flex items-center">
          <span className="mx-1.5 text-zinc-400" aria-hidden>
            /
          </span>
          <span className="text-zinc-700" aria-current="page">
            {current}
          </span>
        </li>
      </ol>
    </nav>
  );
}

/** A standalone "Back to Build Home" button for page action rows. */
export function BackToBuildHomeLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href={BUILD_HUB_HOME_HREF}
      data-testid="back-to-build-home"
      className={`inline-flex min-h-10 items-center rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 ${className}`.trim()}
    >
      {BACK_TO_BUILD_HOME_LABEL}
    </Link>
  );
}

/**
 * Shared BUILD child-page chrome: Build Home breadcrumb + title + back action.
 * Prefer this over Administration headers on BUILD surfaces (even when the URL still lives under `/admin/...`).
 */
export function BuildPageHeader({
  title,
  subtitle,
  breadcrumbCurrent,
  actions,
  className = "",
}: {
  title: string;
  subtitle?: string;
  /** Label for the current page in the Build Home breadcrumb. Defaults to `title`. */
  breadcrumbCurrent?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`.trim()} data-testid="build-page-header">
      <BuildBreadcrumb current={breadcrumbCurrent ?? title} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          {subtitle ? <p className="max-w-3xl text-sm text-zinc-600">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
          <BackToBuildHomeLink />
        </div>
      </header>
    </div>
  );
}
