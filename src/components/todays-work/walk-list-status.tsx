import { StatusBadge } from "@/components/design-system/StatusBadge";
import type { StatusBadgeVariant } from "@/lib/design-system/status-styles";
import type { WalkListStatus } from "@/lib/todays-work";

export function walkListStatusLabel(status: WalkListStatus): string {
  if (status === "blocked") return "Blocked";
  if (status === "in_progress") return "In progress";
  return "Ready";
}

const WALK_STATUS_VARIANT: Record<WalkListStatus, StatusBadgeVariant> = {
  blocked: "blocked",
  in_progress: "in_progress",
  ready: "ready",
};

export function walkListStatusClass(status: WalkListStatus): string {
  if (status === "blocked") return "border-red-200 bg-red-50 text-red-800";
  if (status === "in_progress") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-900";
}

type WalkListStatusBadgeProps = {
  status: WalkListStatus;
};

export function WalkListStatusBadge({ status }: WalkListStatusBadgeProps) {
  return (
    <StatusBadge variant={WALK_STATUS_VARIANT[status]} className="px-2.5 py-1">
      {walkListStatusLabel(status)}
    </StatusBadge>
  );
}
