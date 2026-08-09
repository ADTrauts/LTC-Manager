import Link from "next/link";

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
