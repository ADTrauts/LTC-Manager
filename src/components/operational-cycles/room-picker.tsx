"use client";

import { useState } from "react";

import {
  groupRoomsForPicker,
  isGroupFullySelected,
  summarizeRoomSelection,
  toggleGroupSelection,
  toggleRoomSelection,
  type RoomPickerFilter,
} from "@/lib/operational-cycles/room-picker";
import type { CycleScopeLocationOption } from "@/lib/operational-cycles/cycle-scope";

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm";

export function RoomPicker({
  locations,
  selectedIds,
  onChange,
  filter,
  name,
  emptyMessage = "No matching rooms in this department yet.",
}: {
  locations: CycleScopeLocationOption[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  filter?: RoomPickerFilter;
  /** Hidden input name for form posts (comma-separated ids). */
  name?: string;
  emptyMessage?: string;
}) {
  const groups = groupRoomsForPicker(locations, filter);

  return (
    <div className="space-y-2" data-testid="cycle-room-picker">
      {name ? <input type="hidden" name={name} value={selectedIds.join(",")} /> : null}
      <p className="text-[11px] text-zinc-500">
        {summarizeRoomSelection(selectedIds, locations)}
      </p>
      {groups.length === 0 ? (
        <p className="text-xs text-zinc-500">{emptyMessage}</p>
      ) : (
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-zinc-200 bg-white p-2">
          {groups.map((group) => {
            const allSelected = isGroupFullySelected(group, selectedIds);
            return (
              <div key={group.id}>
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-800">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) =>
                      onChange(toggleGroupSelection(selectedIds, group, event.target.checked))
                    }
                  />
                  {group.label}
                  <span className="text-[11px] font-normal text-zinc-500">
                    ({group.rooms.length})
                  </span>
                </label>
                {group.rooms.map((room) => (
                  <label
                    key={room.id}
                    className="ml-5 flex items-center gap-2 text-sm text-zinc-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(room.id)}
                      onChange={(event) =>
                        onChange(
                          toggleRoomSelection(selectedIds, room.id, event.target.checked),
                        )
                      }
                    />
                    {room.name}
                    {room.roomTypeLabel ? (
                      <span className="text-[11px] text-zinc-500">{room.roomTypeLabel}</span>
                    ) : null}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function KeyTimeGroupsEditor({
  locations,
  groups,
  onChange,
  roomTypes = [],
  fieldName = "keyTimeGroups",
}: {
  locations: CycleScopeLocationOption[];
  groups: Array<{ dueLocal: string; spaceIds: string[] }>;
  onChange: (next: Array<{ dueLocal: string; spaceIds: string[] }>) => void;
  roomTypes?: Array<{ key: string; label: string }>;
  fieldName?: string;
}) {
  const [roomTypeFilterId, setRoomTypeFilterId] = useState("");

  function updateGroup(index: number, patch: Partial<{ dueLocal: string; spaceIds: string[] }>) {
    onChange(
      groups.map((group, i) => (i === index ? { ...group, ...patch } : group)),
    );
  }

  function addGroup() {
    onChange([...groups, { dueLocal: "", spaceIds: [] }]);
  }

  function removeGroup(index: number) {
    onChange(groups.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3" data-testid="key-time-groups-editor">
      <input type="hidden" name={fieldName} value={JSON.stringify(groups)} />
      {roomTypes.length > 0 ? (
        <label className="block text-xs font-medium text-zinc-700">
          Filter by Room Type
          <select
            value={roomTypeFilterId}
            onChange={(event) => setRoomTypeFilterId(event.target.value)}
            className={inputClass}
          >
            <option value="">All rooms</option>
            {roomTypes.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {groups.map((group, index) => (
        <div
          key={`${index}-${group.dueLocal}`}
          className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3"
        >
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-zinc-700">
              Due time
              <input
                type="time"
                value={group.dueLocal}
                onChange={(event) => updateGroup(index, { dueLocal: event.target.value })}
                className={inputClass}
              />
            </label>
            {groups.length > 1 ? (
              <button
                type="button"
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                onClick={() => removeGroup(index)}
              >
                Remove group
              </button>
            ) : null}
          </div>
          <RoomPicker
            locations={locations}
            selectedIds={group.spaceIds}
            onChange={(spaceIds) => updateGroup(index, { spaceIds })}
            filter={
              roomTypeFilterId
                ? { facilityRoomTypeId: roomTypeFilterId }
                : undefined
            }
          />
        </div>
      ))}
      <button
        type="button"
        className="text-xs font-medium text-sky-800 hover:text-sky-950"
        onClick={addGroup}
      >
        + Add another time
      </button>
    </div>
  );
}
