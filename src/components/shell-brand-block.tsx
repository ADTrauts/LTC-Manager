import Link from "next/link";

import { VssylLockup } from "@/components/brand/vssyl-lockup";
import { VssylMark } from "@/components/brand/vssyl-mark";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

type ShellBrandBlockProps = {
  /** Compact header: mark only. Omit for responsive header (mark &lt;xl, lockup xl+). */
  compact?: boolean;
  /** Current Workspace home. Makes the mark a return control. */
  href?: string;
};

/**
 * Product brand in the global top bar. Active workspace is a separate region.
 */
export function ShellBrandBlock({ compact = false, href }: ShellBrandBlockProps) {
  const mark = (
    <span className="inline-flex shrink-0" role="img" aria-label="Vssyl">
      <VssylMark tone="brand" className="h-7 w-7" />
    </span>
  );

  const inner = compact ? (
    mark
  ) : (
    <>
      <span className="inline-flex xl:hidden">{mark}</span>
      <span className="hidden min-w-0 items-center xl:inline-flex">
        <VssylLockup tone="brand" size="header" />
      </span>
    </>
  );

  const layoutClass = compact
    ? "inline-flex min-w-0 shrink-0 items-center"
    : "flex min-w-0 shrink-0 items-center";

  if (!href) {
    return (
      <div className={layoutClass} data-testid="shell-brand">
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={`${layoutClass} rounded-md ${FOCUS_RING_CLASS}`}
      data-testid="shell-brand"
      aria-label="Vssyl home"
    >
      {inner}
    </Link>
  );
}
