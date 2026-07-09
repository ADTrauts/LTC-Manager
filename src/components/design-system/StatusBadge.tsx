import type { ReactNode } from "react";

import {
  statusBadgeClass,
  statusBadgeLabel,
  type StatusBadgeVariant,
} from "@/lib/design-system/status-styles";

export type StatusBadgeProps = {
  variant: StatusBadgeVariant;
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
  "data-readiness-state"?: string;
};

export function StatusBadge({
  variant,
  children,
  className = "",
  "data-testid": dataTestId,
  "data-readiness-state": dataReadinessState,
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(variant)} ${className}`.trim()}
      data-testid={dataTestId}
      data-readiness-state={dataReadinessState}
    >
      {children ?? statusBadgeLabel(variant)}
    </span>
  );
}
