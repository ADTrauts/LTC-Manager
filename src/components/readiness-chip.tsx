import type { ReadinessState } from "@/lib/readiness";

type ReadinessChipProps = {
  state: ReadinessState;
  className?: string;
};

export function readinessStateLabel(state: ReadinessState): string {
  if (state === "blocked") return "Blocked";
  if (state === "in_progress") return "In progress";
  return "Ready";
}

export function readinessStateClass(state: ReadinessState): string {
  if (state === "blocked") return "border-red-200 bg-red-50 text-red-800";
  if (state === "in_progress") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

export function ReadinessChip({ state, className = "" }: ReadinessChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${readinessStateClass(state)} ${className}`}
      data-testid="readiness-chip"
      data-readiness-state={state}
    >
      {readinessStateLabel(state)}
    </span>
  );
}
