"use client";

import { useMemo, useState } from "react";

import type { DepartmentAdminView } from "@/lib/department-administration";

import { LocationTreeRow } from "./LocationTreeRow";
import { LOCATION_TREE_ROW_GAP_CLASS } from "./location-tree-tokens";

type FloorGroup = DepartmentAdminView["locationHierarchy"][number];
type Room = DepartmentAdminView["locations"][number];

type Props = {
  floors: readonly FloorGroup[];
  floorLabel: string;
  neighborhoodLabel: string;
  selectedRoomId?: string | null;
  onSelectRoom?: (room: Room) => void;
};

function floorKey(floor: FloorGroup): string {
  return `floor:${floor.floorName ?? "__none__"}`;
}

function operationalTypeLabel(room: Room): string {
  if (room.hasPattern && room.patternLabel) return room.patternLabel;
  return "No Operational Type";
}

/**
 * Department Locations tree using Facility Builder Structure grammar.
 * Expansion is local UI state only. Does not claim physical locations.
 */
export function DepartmentLocationTree({
  floors,
  floorLabel,
  neighborhoodLabel,
  selectedRoomId = null,
  onSelectRoom,
}: Props) {
  const defaultExpanded = useMemo(() => {
    const next = new Set<string>();
    for (const floor of floors) {
      next.add(floorKey(floor));
      for (const { location } of floor.neighborhoods) {
        next.add(`neighborhood:${location.id}`);
      }
    }
    return next;
  }, [floors]);

  const [expanded, setExpanded] = useState<Set<string>>(defaultExpanded);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (floors.length === 0) return null;

  return (
    <div
      className="overflow-hidden rounded-lg border border-zinc-200 bg-white"
      data-testid="department-location-tree"
    >
      <ul
        className={`${LOCATION_TREE_ROW_GAP_CLASS} p-2`}
        role="tree"
        aria-label={`Where this Department operates — ${floorLabel} hierarchy`}
      >
        {floors.map((floor) => {
          const id = floorKey(floor);
          const isExpanded = expanded.has(id);
          const title = floor.floorName ?? `No ${floorLabel}`;
          const childCount = floor.neighborhoods.length + floor.orphanRooms.length;
          const expandable = childCount > 0;

          return (
            <li
              key={id}
              role="treeitem"
              aria-expanded={expandable ? isExpanded : undefined}
              data-testid="department-location-floor"
            >
              <LocationTreeRow
                kind="floor"
                depth={0}
                label={title}
                expandable={expandable}
                expanded={isExpanded}
                onToggle={() => toggle(id)}
                count={childCount > 0 ? childCount : null}
                countTitle={`${childCount} visible ${floorLabel.toLowerCase()} children`}
                data-testid="department-location-floor-row"
              />

              {isExpanded ? (
                <ul className={LOCATION_TREE_ROW_GAP_CLASS} role="group">
                  {floor.orphanRooms.map((room) => (
                    <RoomItem
                      key={room.id}
                      room={room}
                      depth={1}
                      selected={selectedRoomId === room.id}
                      onSelect={onSelectRoom}
                    />
                  ))}
                  {floor.neighborhoods.map(({ location, rooms }) => {
                    const nId = `neighborhood:${location.id}`;
                    const nExpanded = expanded.has(nId);
                    const canExpand = rooms.length > 0;
                    return (
                      <li
                        key={location.id}
                        role="treeitem"
                        aria-expanded={canExpand ? nExpanded : undefined}
                        data-testid="department-location-neighborhood"
                      >
                        <LocationTreeRow
                          kind="neighborhood"
                          depth={1}
                          label={location.displayName}
                          expandable={canExpand}
                          expanded={nExpanded}
                          onToggle={() => toggle(nId)}
                          count={rooms.length > 0 ? rooms.length : null}
                          countTitle={`${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`}
                          data-testid="department-location-neighborhood-row"
                        />
                        <span className="sr-only">{neighborhoodLabel}</span>
                        {nExpanded && rooms.length > 0 ? (
                          <ul className={LOCATION_TREE_ROW_GAP_CLASS} role="group">
                            {rooms.map((room) => (
                              <RoomItem
                                key={room.id}
                                room={room}
                                depth={2}
                                selected={selectedRoomId === room.id}
                                onSelect={onSelectRoom}
                              />
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RoomItem({
  room,
  depth,
  selected,
  onSelect,
}: {
  room: Room;
  depth: number;
  selected: boolean;
  onSelect?: (room: Room) => void;
}) {
  const physical = room.roomTypeLabel ?? "Physical Type not assigned";
  const operational = operationalTypeLabel(room);
  return (
    <li role="treeitem" data-testid="department-location-room">
      <LocationTreeRow
        kind="room"
        depth={depth}
        label={room.displayName}
        meta={`Physical Type: ${physical}`}
        selected={selected}
        onSelect={onSelect ? () => onSelect(room) : undefined}
        trailing={
          <span
            className={`mr-2 hidden max-w-[11rem] shrink-0 truncate text-xs sm:inline ${
              room.hasPattern ? "font-medium text-zinc-800" : "text-zinc-400"
            }`}
            data-testid="department-location-operational-type"
            title={`Operational Type: ${operational}`}
          >
            {operational}
          </span>
        }
        data-testid="department-location-room-row"
      />
    </li>
  );
}
