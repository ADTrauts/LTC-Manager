import { VssylLockup } from "@/components/brand/vssyl-lockup";
import { VssylMark } from "@/components/brand/vssyl-mark";

type ShellBrandBlockProps = {
  /** Compact header: mark only. Desktop rail: full lockup. */
  compact?: boolean;
};

/**
 * Product brand in the shell. Active workspace is a separate region.
 */
export function ShellBrandBlock({ compact = false }: ShellBrandBlockProps) {
  if (compact) {
    return (
      <span className="inline-flex shrink-0" role="img" aria-label="Vssyl">
        <VssylMark tone="brand" className="h-7 w-7" />
      </span>
    );
  }

  return (
    <div className="flex min-w-0 items-center">
      <VssylLockup tone="brand" size="header" />
    </div>
  );
}
