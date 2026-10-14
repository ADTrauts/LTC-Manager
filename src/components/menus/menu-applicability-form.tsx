"use client";

import { useMemo, useState } from "react";

import { saveMenuApplicabilityAction } from "@/app/(protected)/menus/actions";
import type {
  DepartmentActionableLocation,
  DepartmentLocationFloorGroup,
} from "@/lib/department-administration/department-locations";
import {
  groupRoomsByFacilityRoomType,
  groupRoomsByOperationalType,
} from "@/lib/department-administration/operational-type";
import type { MenuPeriodConfig } from "@/lib/menu-cycle";
import {
  expandAllDepartmentLocations,
  expandRoomsByFacilityRoomType,
  expandRoomsByOperationalType,
  expandRoomsUnderNeighborhood,
  locationTargetFromActionable,
  menuLocationTargetKey,
  suggestMenuPeriodKey,
  type EligibleMenuOperationalCycle,
  type MenuApplicabilityAttention,
  type MenuCycleAssignment,
  type MenuLocationTarget,
} from "@/lib/menu-applicability";

type Props = {
  menuId: string;
  locations: DepartmentActionableLocation[];
  locationHierarchy: DepartmentLocationFloorGroup[];
  floorLabel: string;
  neighborhoodLabel: string;
  selectedLocations: MenuLocationTarget[];
  eligibleCycles: EligibleMenuOperationalCycle[];
  selectedCycles: MenuCycleAssignment[];
  periods: MenuPeriodConfig[];
  attention: MenuApplicabilityAttention[];
  disabled: boolean;
};

function keysFromTargets(targets: readonly MenuLocationTarget[]): string[] {
  return targets.map((target) => menuLocationTargetKey(target));
}

export function MenuApplicabilityForm({
  menuId,
  locations,
  locationHierarchy,
  floorLabel,
  neighborhoodLabel,
  selectedLocations,
  eligibleCycles,
  selectedCycles,
  periods,
  attention,
  disabled,
}: Props) {
  const [locationKeys, setLocationKeys] = useState(() => new Set(keysFromTargets(selectedLocations)));
  const [cycleMap, setCycleMap] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const row of selectedCycles) {
      initial[row.cycleStableKey] = row.menuPeriodKey;
    }
    return initial;
  });

  const staleLocations = useMemo(() => {
    const known = new Set(locations.map((location) => menuLocationTargetKey(locationTargetFromActionable(location))));
    return selectedLocations.filter((target) => !known.has(menuLocationTargetKey(target)));
  }, [locations, selectedLocations]);

  const staleCycles = useMemo(() => {
    const known = new Set(eligibleCycles.map((cycle) => cycle.stableKey));
    return selectedCycles.filter((row) => !known.has(row.cycleStableKey));
  }, [eligibleCycles, selectedCycles]);

  const operationalTypes = useMemo(
    () => groupRoomsByOperationalType(locations).filter((group) => group.patternKey),
    [locations],
  );
  const facilityRoomTypes = useMemo(
    () => groupRoomsByFacilityRoomType(locations).filter((group) => group.roomTypeKey),
    [locations],
  );

  const locationPayload = useMemo(() => {
    const selected = locations
      .filter((location) => locationKeys.has(menuLocationTargetKey(locationTargetFromActionable(location))))
      .map(locationTargetFromActionable);
    const stale = staleLocations.filter((target) => locationKeys.has(menuLocationTargetKey(target)));
    return JSON.stringify([...selected, ...stale]);
  }, [locationKeys, locations, staleLocations]);

  const cyclePayload = useMemo(
    () =>
      JSON.stringify(
        Object.entries(cycleMap).map(([cycleStableKey, menuPeriodKey]) => ({
          cycleStableKey,
          menuPeriodKey,
        })),
      ),
    [cycleMap],
  );

  function addTargets(targets: MenuLocationTarget[]) {
    setLocationKeys((prev) => {
      const next = new Set(prev);
      for (const target of targets) next.add(menuLocationTargetKey(target));
      return next;
    });
  }

  function toggleLocation(location: DepartmentActionableLocation) {
    const key = menuLocationTargetKey(locationTargetFromActionable(location));
    setLocationKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleCycle(cycle: EligibleMenuOperationalCycle, checked: boolean) {
    setCycleMap((prev) => {
      const next = { ...prev };
      if (!checked) {
        delete next[cycle.stableKey];
        return next;
      }
      next[cycle.stableKey] =
        prev[cycle.stableKey] ??
        suggestMenuPeriodKey({ mealType: cycle.mealType, label: cycle.label, periods }) ??
        periods[0]?.key ??
        "";
      return next;
    });
  }

  function selectAllCycles() {
    const next: Record<string, string> = { ...cycleMap };
    for (const cycle of eligibleCycles) {
      next[cycle.stableKey] =
        next[cycle.stableKey] ??
        suggestMenuPeriodKey({ mealType: cycle.mealType, label: cycle.label, periods }) ??
        periods[0]?.key ??
        "";
    }
    setCycleMap(next);
  }

  const selectedLocationCount = locationKeys.size;
  const selectedCycleCount = Object.keys(cycleMap).length;

  return (
    <form action={saveMenuApplicabilityAction} className="space-y-8">
      <input type="hidden" name="menuId" value={menuId} />
      <input type="hidden" name="locationsJson" value={locationPayload} />
      <input type="hidden" name="cyclesJson" value={cyclePayload} />

      {attention.length > 0 ? (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-semibold">Needs Attention</p>
          <ul className="list-disc space-y-1 pl-5">
            {attention.map((item) => (
              <li key={`${item.code}-${item.message}`}>{item.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Where this Menu is used</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {selectedLocationCount} location{selectedLocationCount === 1 ? "" : "s"} selected. Checking a
              neighborhood does not include the rooms beneath it.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              disabled={disabled}
              onClick={() => addTargets(expandAllDepartmentLocations(locations))}
              className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setLocationKeys(new Set())}
              className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            >
              Clear
            </button>
            {operationalTypes.map((group) => (
              <button
                key={group.patternKey}
                type="button"
                disabled={disabled}
                onClick={() => addTargets(expandRoomsByOperationalType(locations, group.patternKey!))}
                className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
              >
                Select {group.label} rooms
              </button>
            ))}
            {operationalTypes.length === 0
              ? facilityRoomTypes.map((group) => (
                  <button
                    key={group.roomTypeKey}
                    type="button"
                    disabled={disabled}
                    onClick={() => addTargets(expandRoomsByFacilityRoomType(locations, group.roomTypeKey!))}
                    className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                  >
                    Select {group.label} rooms
                  </button>
                ))
              : null}
          </div>
        </div>

        {locationHierarchy.length === 0 && staleLocations.length === 0 ? (
          <p className="text-sm text-zinc-600">This Department has no actionable locations yet.</p>
        ) : (
          <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-3">
            {locationHierarchy.map((floor) => (
              <div key={floor.floorId ?? floor.floorName ?? "none"}>
                {floor.floorName ? (
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {floorLabel} · {floor.floorName}
                  </p>
                ) : (
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ungrouped</p>
                )}
                <div className="mt-2 space-y-3">
                  {floor.neighborhoods.map(({ location, rooms }) => {
                    const neighborhoodKey = menuLocationTargetKey(locationTargetFromActionable(location));
                    return (
                      <div key={location.id} className="pl-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                            <input
                              type="checkbox"
                              checked={locationKeys.has(neighborhoodKey)}
                              disabled={disabled}
                              onChange={() => toggleLocation(location)}
                            />
                            {location.displayName}
                            <span className="font-normal text-zinc-500">({neighborhoodLabel})</span>
                          </label>
                          {rooms.length > 0 ? (
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => addTargets(expandRoomsUnderNeighborhood(locations, location.id))}
                              className="text-xs font-medium text-zinc-700 underline underline-offset-2 disabled:opacity-50"
                            >
                              Select rooms
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-1 space-y-1 pl-6">
                          {rooms.map((room) => {
                            const key = menuLocationTargetKey(locationTargetFromActionable(room));
                            return (
                              <label key={room.id} className="flex items-center gap-2 text-sm text-zinc-800">
                                <input
                                  type="checkbox"
                                  checked={locationKeys.has(key)}
                                  disabled={disabled}
                                  onChange={() => toggleLocation(room)}
                                />
                                {room.displayName}
                                {room.patternLabel || room.roomTypeLabel ? (
                                  <span className="text-xs text-zinc-500">
                                    {room.patternLabel ?? room.roomTypeLabel}
                                  </span>
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {floor.orphanRooms.map((room) => {
                    const key = menuLocationTargetKey(locationTargetFromActionable(room));
                    return (
                      <label key={room.id} className="flex items-center gap-2 pl-1 text-sm text-zinc-800">
                        <input
                          type="checkbox"
                          checked={locationKeys.has(key)}
                          disabled={disabled}
                          onChange={() => toggleLocation(room)}
                        />
                        {room.displayName}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {staleLocations.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Saved locations to review</p>
                {staleLocations.map((target) => {
                  const key = menuLocationTargetKey(target);
                  return (
                    <label key={key} className="mt-1 flex items-center gap-2 text-sm text-amber-950">
                      <input
                        type="checkbox"
                        checked={locationKeys.has(key)}
                        disabled={disabled}
                        onChange={() => {
                          setLocationKeys((prev) => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          });
                        }}
                      />
                      Previously assigned location
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">When this Menu is used</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {selectedCycleCount} Operational Cycle{selectedCycleCount === 1 ? "" : "s"} selected. Each selected
              cycle needs a Menu period mapping.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              disabled={disabled}
              onClick={selectAllCycles}
              className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            >
              Select all
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setCycleMap({})}
              className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>

        {eligibleCycles.length === 0 && staleCycles.length === 0 ? (
          <p className="text-sm text-zinc-600">
            No published root Operational Cycles are available for this Department yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Operational Cycle</th>
                  <th className="px-3 py-2">Menu period</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {eligibleCycles.map((cycle) => {
                  const checked = cycle.stableKey in cycleMap;
                  return (
                    <tr key={cycle.stableKey}>
                      <td className="px-3 py-2">
                        <label className="flex items-center gap-2 font-medium text-zinc-900">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={(event) => toggleCycle(cycle, event.target.checked)}
                          />
                          {cycle.label}
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          disabled={disabled || !checked}
                          value={cycleMap[cycle.stableKey] ?? ""}
                          onChange={(event) =>
                            setCycleMap((prev) => ({ ...prev, [cycle.stableKey]: event.target.value }))
                          }
                          className="w-full max-w-xs rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:bg-zinc-50"
                        >
                          <option value="">{checked ? "Choose a period" : "—"}</option>
                          {periods.map((period) => (
                            <option key={period.key} value={period.key}>
                              {period.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {staleCycles.map((row) => (
                  <tr key={`stale-${row.cycleStableKey}`}>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2 font-medium text-amber-950">
                        <input
                          type="checkbox"
                          checked={row.cycleStableKey in cycleMap}
                          disabled={disabled}
                          onChange={() => {
                            setCycleMap((prev) => {
                              const next = { ...prev };
                              if (next[row.cycleStableKey]) delete next[row.cycleStableKey];
                              else next[row.cycleStableKey] = row.menuPeriodKey;
                              return next;
                            });
                          }}
                        />
                        {row.cycleStableKey}
                        <span className="font-normal text-amber-800">Needs review</span>
                      </label>
                    </td>
                    <td className="px-3 py-2 text-sm text-amber-900">{row.menuPeriodKey}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        Save applicability
      </button>
    </form>
  );
}
