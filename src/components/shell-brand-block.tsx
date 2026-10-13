import { VssylLockup } from "@/components/brand/vssyl-lockup";
import { VssylMark } from "@/components/brand/vssyl-mark";

type ShellBrandBlockProps = {
  /** Compact header: mark only. Omit for responsive header (mark &lt;xl, lockup xl+). */
  compact?: boolean;
};

/**
 * Product brand in the global top bar. Active workspace is a separate region.
 */
export function ShellBrandBlock({ compact = false }: ShellBrandBlockProps) {
  const mark = (
    <span className="inline-flex shrink-0" role="img" aria-label="Vssyl">
      <VssylMark tone="brand" className="h-7 w-7" />
    </span>
  );

  if (compact) {
    return mark;
  }

  return (
    <div className="flex min-w-0 items-center" data-testid="shell-brand">
      <span className="inline-flex xl:hidden">{mark}</span>
      <span className="hidden min-w-0 items-center xl:inline-flex">
        <VssylLockup tone="brand" size="header" />
      </span>
    </div>
  );
}
