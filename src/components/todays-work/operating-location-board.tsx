import {
  operationalListShellClass,
  operationalListShellMutedClass,
} from "@/components/design-system/OperationalListRow";
import { SectionHeader } from "@/components/design-system/SectionHeader";
import type { OperatingLocationStatus } from "@/lib/todays-work/operating-locations";

import { OperatingLocationRow } from "./operating-location-row";

type OperatingLocationBoardProps = {
  locations: readonly OperatingLocationStatus[];
  grouped?: boolean;
};

/** Stable React key — physical ids can repeat across departments in facility lens. */
function operatingLocationRowKey(row: OperatingLocationStatus): string {
  return `${row.location.departmentKey ?? "none"}:${row.location.id}:${row.facilityOrder}`;
}

export function OperatingLocationBoard({
  locations,
  grouped = true,
}: OperatingLocationBoardProps) {
  if (locations.length === 0) {
    return (
      <p className="text-sm text-zinc-500" data-testid="operating-locations-empty">
        No active locations configured.
      </p>
    );
  }

  const attention = locations.filter((row) => row.derivedStatus === "needs_attention");
  const remaining = locations.filter((row) => row.derivedStatus !== "needs_attention");

  const renderGrouped = (rows: readonly OperatingLocationStatus[], startRank: number) => {
    const groups: { floor: string | null; rows: OperatingLocationStatus[] }[] = [];
    for (const row of rows) {
      const floor = grouped ? row.floorLabel : null;
      const last = groups[groups.length - 1];
      if (last && last.floor === floor) {
        last.rows.push(row);
      } else {
        groups.push({ floor, rows: [row] });
      }
    }
    let rank = startRank;
    return groups.map((group, groupIndex) => {
      const items = group.rows.map((row) => {
        const currentRank = rank;
        rank += 1;
        return (
          <OperatingLocationRow
            key={operatingLocationRowKey(row)}
            location={row}
            rank={currentRank}
            emphasized={row.derivedStatus === "needs_attention" && currentRank === 1}
          />
        );
      });
      const lead = group.rows[0];
      return (
        <div
          key={`floor-group-${groupIndex}-${group.floor ?? "none"}-${lead ? operatingLocationRowKey(lead) : "empty"}`}
        >
          {grouped && group.floor ? (
            <p className="px-1 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {group.floor}
            </p>
          ) : null}
          <ul className="divide-y divide-zinc-100">{items}</ul>
        </div>
      );
    });
  };

  return (
    <div className="space-y-4" data-testid="operating-locations-board">
      {attention.length > 0 ? (
        <div className={operationalListShellClass}>{renderGrouped(attention, 1)}</div>
      ) : null}
      {remaining.length > 0 ? (
        <div className={operationalListShellMutedClass}>
          {renderGrouped(remaining, attention.length + 1)}
        </div>
      ) : null}
    </div>
  );
}

type WalkListBoardProps = {
  locations: readonly OperatingLocationStatus[];
};

export function OperatingLocationWalkList({ locations }: WalkListBoardProps) {
  if (locations.length === 0) {
    return (
      <p className="text-sm text-zinc-500" data-testid="operating-locations-empty">
        No active locations configured.
      </p>
    );
  }

  const allOnTrack = locations.every((row) => row.derivedStatus === "on_track");

  return (
    <div className="space-y-4" data-testid="todays-work-walk-list">
      {allOnTrack ? (
        <SectionHeader
          eyebrow="Routine walk"
          title="All locations are currently on track."
          description="Use this list for a standard round in facility order."
        />
      ) : (
        <SectionHeader
          eyebrow="Walk list"
          title="Risk-ordered operating locations."
          description="Start with locations that need attention, then continue the routine round."
        />
      )}
      <div className={operationalListShellClass}>
        <ul className="divide-y divide-zinc-100">
          {locations.map((row, index) => (
            <OperatingLocationRow
              key={operatingLocationRowKey(row)}
              location={row}
              rank={index + 1}
              emphasized={index === 0 && row.derivedStatus === "needs_attention"}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
