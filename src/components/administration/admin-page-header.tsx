import Link from "next/link";
import type { ReactNode } from "react";

export const ADMINISTRATION_HUB_HREF = "/admin";
export const ADMINISTRATION_ROOT_LABEL = "Administration";
export const BACK_TO_ADMINISTRATION_LABEL = "Back to Administration";

export type AdminBreadcrumbSegment = {
  label: string;
  /** Omit on the current page segment. */
  href?: string;
};

export type AdminPageHeaderProps = {
  title: string;
  subtitle?: string;
  /**
   * Breadcrumb segments after Administration.
   * Example: [{ label: "Departments", href: "/admin/departments" }, { label: "Dietary" }]
   */
  trail: readonly AdminBreadcrumbSegment[];
  /** Default true — shows a text link back to `/admin`. */
  showBackToAdministration?: boolean;
  actions?: ReactNode;
  below?: ReactNode;
  className?: string;
};

export function AdminBreadcrumbs({
  trail,
}: {
  trail: readonly AdminBreadcrumbSegment[];
}) {
  return (
    <nav aria-label="Administration breadcrumb" className="text-sm text-zinc-500">
      <ol className="flex flex-wrap items-center gap-x-0">
        <li className="inline-flex items-center">
          <Link
            href={ADMINISTRATION_HUB_HREF}
            className="font-medium text-zinc-700 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          >
            {ADMINISTRATION_ROOT_LABEL}
          </Link>
        </li>
        {trail.map((segment, index) => (
          <li key={`${segment.label}-${index}`} className="inline-flex items-center">
            <span className="mx-1.5 text-zinc-400" aria-hidden>
              /
            </span>
            {segment.href ? (
              <Link
                href={segment.href}
                className="font-medium text-zinc-700 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              >
                {segment.label}
              </Link>
            ) : (
              <span className="text-zinc-600" aria-current="page">
                {segment.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function BackToAdministrationLink({
  className = "",
}: {
  className?: string;
}) {
  return (
    <Link
      href={ADMINISTRATION_HUB_HREF}
      className={`inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 ${className}`.trim()}
    >
      {BACK_TO_ADMINISTRATION_LABEL}
    </Link>
  );
}

/**
 * Shared Administration child-page chrome: breadcrumb root + title + optional back action.
 * No page-specific business logic.
 */
export function AdminPageHeader({
  title,
  subtitle,
  trail,
  showBackToAdministration = true,
  actions,
  below,
  className = "",
}: AdminPageHeaderProps) {
  return (
    <header className={`space-y-2 ${className}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <AdminBreadcrumbs trail={trail} />
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          {subtitle ? <p className="max-w-3xl text-sm text-zinc-600">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
          {showBackToAdministration ? <BackToAdministrationLink /> : null}
        </div>
      </div>
      {below ? <div className="pt-1">{below}</div> : null}
    </header>
  );
}
