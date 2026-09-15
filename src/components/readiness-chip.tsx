import { StatusBadge } from "@/components/design-system/StatusBadge";
import { statusBadgeClass, type StatusBadgeVariant } from "@/lib/design-system/status-styles";
import type { ReadinessState } from "@/lib/readiness";

type ReadinessChipProps = {
  state: ReadinessState;
  className?: string;
  /**
   * Sidebar uses quiet Ready so healthy locations do not form a wall of green.
   * Exceptions stay loud. Meaning/state unchanged.
   */
  prominence?: "default" | "quiet";
};

const READINESS_VARIANT: Record<ReadinessState, StatusBadgeVariant> = {
  ready: "ready",
  in_progress: "in_progress",
  blocked: "blocked",
};

export function readinessStateLabel(state: ReadinessState): string {
  if (state === "blocked") return "Needs Attention";
  if (state === "in_progress") return "In Progress";
  return "Ready";
}

export function readinessStateClass(state: ReadinessState): string {
  return statusBadgeClass(READINESS_VARIANT[state]);
}

export function ReadinessChip({
  state,
  className = "",
  prominence = "default",
}: ReadinessChipProps) {
  const effectiveProminence =
    prominence === "quiet" && state === "ready" ? "quiet" : "default";

  return (
    <StatusBadge
      variant={READINESS_VARIANT[state]}
      prominence={effectiveProminence}
      className={className}
      data-testid="readiness-chip"
      data-readiness-state={state}
    >
      {readinessStateLabel(state)}
    </StatusBadge>
  );
}
