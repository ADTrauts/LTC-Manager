import type { ReactNode } from "react";

import {
  statusBadgeClass,
  statusBadgeLabel,
  type StatusBadgeVariant,
  type StatusProminence,
} from "@/lib/design-system/status-styles";

export type StatusBadgeProps = {
  variant: StatusBadgeVariant;
  children?: ReactNode;
  className?: string;
  /**
   * Quiet healthy states (ready/success) for attention economy — e.g. Run sidebar.
   * Does not change semantic meaning; only presentation weight.
   */
  prominence?: StatusProminence;
  "data-testid"?: string;
  "data-readiness-state"?: string;
};

export function StatusBadge({
  variant,
  children,
  className = "",
  prominence = "default",
  "data-testid": dataTestId,
  "data-readiness-state": dataReadinessState,
}: StatusBadgeProps) {
  const quietHealthy =
    prominence === "quiet" && (variant === "ready" || variant === "success");

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(variant, prominence)} ${className}`.trim()}
      data-testid={dataTestId}
      data-readiness-state={dataReadinessState}
      data-prominence={prominence}
    >
      {quietHealthy ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/70"
          aria-hidden
        />
      ) : null}
      {children ?? statusBadgeLabel(variant)}
    </span>
  );
}
