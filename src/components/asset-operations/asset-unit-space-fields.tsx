"use client";

import { useMemo, useState } from "react";

export type AssetLocationUnitOption = {
  id: string;
  name: string;
};

export type AssetLocationSpaceOption = {
  id: string;
  name: string;
  unitId: string | null;
};

type Props = {
  units: AssetLocationUnitOption[];
  spaces: AssetLocationSpaceOption[];
  /** Facility vocabulary singular for level 3 (default Room). */
  roomTerm?: string;
  defaultUnitId?: string;
  defaultSpaceId?: string | null;
  /** Prefix for form field names when multiple forms share a page. */
  unitFieldName?: string;
  spaceFieldName?: string;
  requiredUnit?: boolean;
  unitTestId?: string;
  spaceTestId?: string;
  className?: string;
};

/**
 * Cascading Unit → Room picker for Asset Builder / identity edit.
 * Changing Unit clears an invalid Room selection (does not retain prior Unit's room).
 */
export function AssetUnitSpaceFields({
  units,
  spaces,
  roomTerm = "Room",
  defaultUnitId = "",
  defaultSpaceId = null,
  unitFieldName = "unitId",
  spaceFieldName = "spaceId",
  requiredUnit = true,
  unitTestId = "create-asset-unit",
  spaceTestId = "create-asset-space",
  className,
}: Props) {
  const [unitId, setUnitId] = useState(defaultUnitId);
  const [spaceId, setSpaceId] = useState(defaultSpaceId ?? "");

  const eligibleSpaces = useMemo(
    () =>
      spaces
        .filter((s) => s.unitId === unitId)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [spaces, unitId],
  );

  function onUnitChange(next: string) {
    setUnitId(next);
    const stillValid = spaces.some((s) => s.id === spaceId && s.unitId === next);
    if (!stillValid) {
      setSpaceId("");
    }
  }

  return (
    <div className={className ?? "contents"}>
      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        <span className="font-medium text-zinc-900">Location (unit / neighborhood)</span>
        <select
          name={unitFieldName}
          required={requiredUnit}
          value={unitId}
          onChange={(e) => onUnitChange(e.target.value)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          data-testid={unitTestId}
        >
          <option value="">Select location</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-zinc-700">
        <span className="font-medium text-zinc-900">{roomTerm} (optional)</span>
        <select
          name={spaceFieldName}
          value={spaceId}
          onChange={(e) => setSpaceId(e.target.value)}
          disabled={!unitId || eligibleSpaces.length === 0}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-50"
          data-testid={spaceTestId}
        >
          <option value="">
            {!unitId
              ? `Select a location first`
              : eligibleSpaces.length === 0
                ? `No ${roomTerm.toLowerCase()}s under this location`
                : `No specific ${roomTerm.toLowerCase()}`}
          </option>
          {eligibleSpaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
