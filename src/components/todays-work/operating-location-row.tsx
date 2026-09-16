import { OperationalListRow } from "@/components/design-system/OperationalListRow";
import { StatusBadge } from "@/components/design-system/StatusBadge";
import type { StatusBadgeVariant } from "@/lib/design-system/status-styles";
import {
  operatingLocationStatusLabel,
  type OperatingLocationStatus,
  type OperatingLocationStatusKey,
} from "@/lib/todays-work/operating-locations";

const STATUS_VARIANT: Record<OperatingLocationStatusKey, StatusBadgeVariant> = {
  needs_attention: "blocked",
  in_progress: "in_progress",
  on_track: "ready",
};

type OperatingLocationRowProps = {
  location: OperatingLocationStatus;
  rank?: number;
  emphasized?: boolean;
};

export function OperatingLocationRow({
  location,
  rank,
  emphasized = false,
}: OperatingLocationRowProps) {
  const facts = [
    location.staffing.label,
    location.currentOperation.label,
    location.keyTime?.summary,
  ].filter(Boolean);
  const description = [location.contextLabel, location.issueSummary].filter(Boolean).join(" · ");

  return (
    <OperationalListRow
      emphasized={emphasized}
      href={location.href}
      rank={rank}
      title={location.displayName}
      testId="operating-location-row"
      description={description || undefined}
      details={
        facts.length > 0 ? (
          <p className="mt-1 text-xs text-zinc-600" data-testid="operating-location-facts">
            {facts.join(" · ")}
          </p>
        ) : null
      }
      status={
        <StatusBadge variant={STATUS_VARIANT[location.derivedStatus]} className="px-2.5 py-1">
          {operatingLocationStatusLabel(location.derivedStatus)}
        </StatusBadge>
      }
    />
  );
}
