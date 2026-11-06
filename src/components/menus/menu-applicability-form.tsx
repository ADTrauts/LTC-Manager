"use client";

import { useMemo, useState } from "react";

import { saveMenuApplicabilityAction } from "@/app/(protected)/menus/actions";
import type {
  DepartmentActionableLocation,
  DepartmentLocationFloorGroup,
} from "@/lib/department-administration/department-locations";
import {
  expandAllDepartmentLocations,
  expandRoomsUnderNeighborhood,
  locationTargetFromActionable,
  menuLocationTargetKey,
  offerSelectRemainingRoomsOfType,
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
  selectedCycles: MenuCycleAssignment[];
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
  selectedCycles,
  attention,
  disabled,
}: Props) {
  const [locationKeys, setLocationKeys] = useState(() => new Set(keysFromTargets(selectedLocations)));

  const staleLocations = useMemo(() => {
    const known = new Set(locations.map((location) => menuLocationTargetKey(locationTargetFromActionable(location))));
    return selectedLocations.filter((target) => !known.has(menuLocationTargetKey(target)));
  }, [locations, selectedLocations]);

  const [typeOffer, setTypeOffer] = useState<{ label: string; remaining: MenuLocationTarget[] } | null>(
    null,
  );

  const locationPayload = useMemo(() => {
    const selected = locations
      .filter((location) => locationKeys.has(menuLocationTargetKey(locationTargetFromActionable(location))))
      .map(locationTargetFromActionable);
    const stale = staleLocations.filter((target) => locationKeys.has(menuLocationTargetKey(target)));
    return JSON.stringify([...selected, ...stale]);
  }, [locationKeys, locations, staleLocations]);

  const cyclePayload = JSON.stringify(selectedCycles);

  function addTargets(targets: MenuLocationTarget[]) {
    setTypeOffer(null);
    setLocationKeys((prev) => {
      const next = new Set(prev);
      for (const target of targets) next.add(menuLocationTargetKey(target));
      return next;
    });
  }

  function acceptTypeOffer() {
    if (!typeOffer) return;
    addTargets(typeOffer.remaining);
  }

  function toggleLocation(location: DepartmentActionableLocation) {
    const key = menuLocationTargetKey(locationTargetFromActionable(location));
    const selecting = !locationKeys.has(key);
    setLocationKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!selecting || location.kind !== "room") {
      setTypeOffer(null);
      return;
    }
    const selectedKeys = new Set(locationKeys);
    selectedKeys.add(key);
    setTypeOffer(offerSelectRemainingRoomsOfType({ locations, chosen: location, selectedKeys }));
  }

  const selectedLocationCount = locationKeys.size;

  return (
    <form action={saveMenuApplicabilityAction} className="space-y-5">
      <input type="hidden" name="menuId" value={menuId} />
      <input type="hidden" name="locationsJson" value={locationPayload} />
      <input type="hidden" name="cyclesJson" value={cyclePayload} />

      {typeOffer ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="menu-type-offer-title"
        >
          <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4">
            <p id="menu-type-offer-title" className="text-sm font-semibold text-zinc-900">
              Do you want to select all {typeOffer.label} rooms?
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              {typeOffer.remaining.length === 1
                ? `1 other ${typeOffer.label} room can be added.`
                : `${typeOffer.remaining.length} other ${typeOffer.label} rooms can be added.`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTypeOffer(null)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
              >
                Just this room
              </button>
              <button
                type="button"
                onClick={acceptTypeOffer}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Select all
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              Where this Menu is used
              <span className="ml-2 text-sm font-normal text-zinc-500">
                {selectedLocationCount} selected
              </span>
            </h2>
            <p className="text-xs text-zinc-500">
              Checking a neighborhood does not include the rooms beneath it.
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
              onClick={() => {
                setTypeOffer(null);
                setLocationKeys(new Set());
              }}
              className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            >
              Clear
            </button>
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

      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        Save locations
      </button>
    </form>
  );
}
