import { StatusBadge } from "@/components/design-system/StatusBadge";
import type { StatusBadgeVariant } from "@/lib/design-system/status-styles";
import type { CoverageLevel } from "@/lib/todays-work";

export function coverageLevelLabel(level: CoverageLevel): string {
  if (level === "none") return "Gap";
  if (level === "thin") return "Thin";
  return "Covered";
}

const COVERAGE_LEVEL_VARIANT: Record<CoverageLevel, StatusBadgeVariant> = {
  none: "blocked",
  thin: "warning",
  covered: "ready",
};

export function coverageLevelClass(level: CoverageLevel): string {
  if (level === "none") return "border-red-200 bg-red-50 text-red-800";
  if (level === "thin") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

type CoverageLevelBadgeProps = {
  level: CoverageLevel;
};

export function CoverageLevelBadge({ level }: CoverageLevelBadgeProps) {
  return (
    <StatusBadge variant={COVERAGE_LEVEL_VARIANT[level]} className="px-2.5 py-1">
      {coverageLevelLabel(level)}
    </StatusBadge>
  );
}
