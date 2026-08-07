"use client";

import { useMemo, useState } from "react";

export type AssignmentSpaceOption = {
  id: string;
  label: string;
  unitId: string | null;
  unitName: string | null;
  roomNumber: string | null;
  sortOrder: number;
};

export type AssignmentZoneOption = {
  id: string;
  name: string;
  locationCount: number;
  unitSpaceIds: string[];
};

type Props = {
  spaces: AssignmentSpaceOption[];
  zones?: AssignmentZoneOption[];
  /** Hidden input name submitted with the form (comma-separated ids). */
  name?: string;
  zoneFieldName?: string;
  initialSelectedIds?: string[];
  selectedUnitId?: string | null;
};

/**
 * Efficient multi-select for 40–60 Rooms/Spaces on the Assignment Board.
 * Friendly labels only — never exposes raw IDs as primary UI.
 */
export function AssignmentSpaceScopePicker({
  spaces,
  zones = [],
  name = "unitSpaceIds",
  zoneFieldName = "sourceZoneId",
  initialSelectedIds = [],
  selectedUnitId = null,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelectedIds));
  const [zoneId, setZoneId] = useState("");
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return spaces.filter((s) => {
      if (selectedUnitId && s.unitId && s.unitId !== selectedUnitId) return false;
      if (!q) return true;
      return (
        s.label.toLowerCase().includes(q) ||
        (s.unitName?.toLowerCase().includes(q) ?? false) ||
        (s.roomNumber?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [spaces, selectedUnitId, filter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of visible) next.add(s.id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setZoneId("");
  }

  function applyZone(nextZoneId: string) {
    setZoneId(nextZoneId);
    const zone = zones.find((z) => z.id === nextZoneId);
    if (!zone) return;
    setSelected(new Set(zone.unitSpaceIds));
  }

  const selectedList = spaces.filter((s) => selected.has(s.id));

  return (
    <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3" data-testid="assignment-space-scope-picker">
      <input type="hidden" name={name} value={[...selected].join(",")} />
      <input type="hidden" name={zoneFieldName} value={zoneId} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-800">
          Room / Space scope
          <span className="ml-2 font-normal text-zinc-500">
            {selected.size === 0
              ? "Entire Unit (when Unit selected)"
              : `${selected.size} selected`}
          </span>
        </p>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={selectAllVisible}
            className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100"
          >
            Select all in view
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100"
          >
            Clear
          </button>
        </div>
      </div>

      {zones.length > 0 ? (
        <select
          value={zoneId}
          onChange={(e) => applyZone(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          data-testid="assignment-zone-select"
        >
          <option value="">Zone (optional convenience)…</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name} · {z.locationCount} locations
            </option>
          ))}
        </select>
      ) : null}

      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter rooms…"
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        data-testid="assignment-space-filter"
      />

      <div
        className="max-h-56 overflow-y-auto rounded-md border border-zinc-200 bg-white"
        data-testid="assignment-space-list"
      >
        {visible.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-zinc-500">No Rooms match this filter.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {visible.map((s) => {
              const checked = selected.has(s.id);
              return (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.id)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-zinc-900">{s.label}</span>
                      {s.unitName ? (
                        <span className="mt-0.5 block text-xs text-zinc-500">{s.unitName}</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedList.length > 0 ? (
        <p className="text-xs text-zinc-600" data-testid="assignment-space-selection-summary">
          Selected:{" "}
          {selectedList
            .slice(0, 8)
            .map((s) => s.label)
            .join(", ")}
          {selectedList.length > 8 ? ` +${selectedList.length - 8} more` : ""}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">
          Leave empty to assign the entire Unit. Selecting Rooms snapshots responsibility for this
          Assignment — later Zone edits will not rewrite it.
        </p>
      )}
    </div>
  );
}
