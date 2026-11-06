/**
 * Operational Cycle scope + configured meal-time helpers (pure).
 * User-facing: Operational Types | Entire department | Specific locations.
 * Physical Room Type and legacy Unit.unitType remain compatibility scopes.
 */

import type {
  OperationalCycleLocationMode,
  ServeryMilestone,
  UnitHierarchyRole,
} from "@prisma/client";

import {
  SPACE_TYPE_PRESETS,
  findSpaceTypePreset,
  roomTypeIdentity,
} from "@/lib/facility-builder/space-type-presets";
import type { SpaceType } from "@prisma/client";

export type CycleUserScope = "department" | "operational_types" | "room_type" | "specific";

export type CycleMilestoneTimeInput = {
  unitId: string;
  milestone: ServeryMilestone;
  configuredTime: string;
};

export type CycleScopeLocationOption = {
  id: string;
  kind: "neighborhood" | "room";
  name: string;
  roomTypeKey?: string | null;
  roomTypeLabel?: string | null;
  /** Facility Room Type id when cataloged — preferred filter for Build room pickers. */
  facilityRoomTypeId?: string | null;
  neighborhoodId?: string | null;
  neighborhoodName?: string | null;
  hierarchyRole?: UnitHierarchyRole | null;
  /** Structural floor label for picker grouping only — never persisted as membership. */
  floorName?: string | null;
};

export type StandardRoomTypeOption = {
  key: string;
  label: string;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isStandardRoomTypeKey(key: string): boolean {
  if (!key || key.startsWith("custom:")) return false;
  const preset = findSpaceTypePreset(key);
  return Boolean(preset && !preset.requiresCustomLabel);
}

export function standardRoomTypeOptions(): StandardRoomTypeOption[] {
  return SPACE_TYPE_PRESETS.filter((p) => !p.requiresCustomLabel).map((p) => ({
    key: p.key,
    label: p.label,
  }));
}

export function userFacingScopeFromMode(
  mode: OperationalCycleLocationMode,
): CycleUserScope {
  if (mode === "OPERATIONAL_TYPES") return "operational_types";
  if (mode === "ROOM_TYPE") return "room_type";
  if (mode === "EXPLICIT_UNITS") return "specific";
  return "department";
}

export function locationModeFromUserScope(
  scope: CycleUserScope,
): Extract<
  OperationalCycleLocationMode,
  "ALL_DEPARTMENT_UNITS" | "OPERATIONAL_TYPES" | "ROOM_TYPE" | "EXPLICIT_UNITS"
> {
  if (scope === "operational_types") return "OPERATIONAL_TYPES";
  if (scope === "room_type") return "ROOM_TYPE";
  if (scope === "specific") return "EXPLICIT_UNITS";
  return "ALL_DEPARTMENT_UNITS";
}

export function normalizeConfiguredTime(raw: string): string | null {
  const trimmed = raw.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function isValidConfiguredTime(raw: string): boolean {
  const normalized = normalizeConfiguredTime(raw);
  return Boolean(normalized && TIME_RE.test(normalized));
}

export function unitMayOwnConfiguredMealTime(input: {
  hierarchyRole: UnitHierarchyRole | null | undefined;
}): boolean {
  return input.hierarchyRole !== "FLOOR" && input.hierarchyRole !== "BUILDING";
}

/**
 * Unique Neighborhood/Unit ids for meal-time rows from scoped Servery (or other) rooms.
 * Orphan rooms whose parent is a Floor (or missing) are skipped.
 */
export function neighborhoodIdsFromScopedRooms(
  rooms: readonly CycleScopeLocationOption[],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const room of rooms) {
    if (room.kind !== "room") continue;
    const neighborhoodId = room.neighborhoodId?.trim();
    if (!neighborhoodId) continue;
    if (seen.has(neighborhoodId)) continue;
    seen.add(neighborhoodId);
    ids.push(neighborhoodId);
  }
  return ids;
}

export function roomsMatchingRoomType(
  rooms: readonly CycleScopeLocationOption[],
  roomTypeKey: string,
): CycleScopeLocationOption[] {
  if (!isStandardRoomTypeKey(roomTypeKey)) return [];
  return rooms.filter(
    (room) => room.kind === "room" && room.roomTypeKey === roomTypeKey,
  );
}

export function roomTypeKeyForStoredSpace(input: {
  spaceType: SpaceType;
  customTypeLabel?: string | null;
}): string {
  return roomTypeIdentity(input).key;
}

export function shouldShowServiceStartTimes(input: {
  cycleType: string;
  mealType: string | null | undefined;
  expectedMilestones: readonly string[];
}): boolean {
  return (
    input.cycleType === "SERVICE" &&
    Boolean(input.mealType) &&
    input.expectedMilestones.includes("SERVICE_STARTED")
  );
}

export function scopeGroupLabel(input: {
  locationMode: OperationalCycleLocationMode;
  roomTypeKey?: string | null;
  applicableOperationalTypeKeys?: readonly string[];
  operationalTypeNames?: Readonly<Record<string, string>>;
  unitIds?: readonly string[];
  spaceIds?: readonly string[];
  locationNames?: Readonly<Record<string, string>>;
}): string {
  if (input.locationMode === "OPERATIONAL_TYPES") {
    const keys = input.applicableOperationalTypeKeys ?? [];
    const names = input.operationalTypeNames ?? {};
    if (keys.length === 1) return names[keys[0]!] ?? "Operational Type";
    if (keys.length > 1) return "Operational Types";
    return "Operational Types";
  }
  if (input.locationMode === "ROOM_TYPE") {
    const preset = input.roomTypeKey ? findSpaceTypePreset(input.roomTypeKey) : undefined;
    if (preset?.key === "servery") return "Serveries";
    return preset?.label ?? "Room Type";
  }
  if (input.locationMode === "EXPLICIT_UNITS") {
    const names = input.locationNames ?? {};
    const ids = [...(input.spaceIds ?? []), ...(input.unitIds ?? [])];
    if (ids.length === 1) {
      return names[ids[0]!] ?? "Specific locations";
    }
    return "Specific locations";
  }
  if (input.locationMode === "UNIT_TYPES") return "Legacy scope — edit to update";
  return "Entire department";
}

export function describeUserFacingScope(input: {
  locationMode: OperationalCycleLocationMode;
  roomTypeKey?: string | null;
  applicableOperationalTypeKeys?: readonly string[];
  operationalTypeNames?: Readonly<Record<string, string>>;
  unitIds?: readonly string[];
  spaceIds?: readonly string[];
  locationNames?: Readonly<Record<string, string>>;
}): string {
  if (input.locationMode === "OPERATIONAL_TYPES") {
    const keys = input.applicableOperationalTypeKeys ?? [];
    const names = input.operationalTypeNames ?? {};
    const labels = keys.map((key) => names[key] ?? key);
    if (labels.length === 0) return "Operational Types";
    if (labels.length <= 3) return `Operational Types: ${labels.join(", ")}`;
    return `Operational Types: ${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
  }
  if (input.locationMode === "ROOM_TYPE") {
    const preset = input.roomTypeKey ? findSpaceTypePreset(input.roomTypeKey) : undefined;
    return preset ? `Room Type: ${preset.label}` : "Room Type";
  }
  if (input.locationMode === "EXPLICIT_UNITS") {
    const names = input.locationNames ?? {};
    const labels = [...(input.spaceIds ?? []), ...(input.unitIds ?? [])].map(
      (id) => names[id] ?? "Location",
    );
    if (labels.length === 0) return "Specific locations";
    if (labels.length <= 3) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
  }
  if (input.locationMode === "UNIT_TYPES") return "Legacy scope — edit to update";
  return "Entire department";
}

export function summarizeScopeChange(input: {
  from: {
    locationMode: OperationalCycleLocationMode;
    roomTypeKey?: string | null;
    applicableOperationalTypeKeys?: readonly string[];
    operationalTypeNames?: Readonly<Record<string, string>>;
    unitIds?: readonly string[];
    spaceIds?: readonly string[];
  };
  to: {
    locationMode: OperationalCycleLocationMode;
    roomTypeKey?: string | null;
    applicableOperationalTypeKeys?: readonly string[];
    operationalTypeNames?: Readonly<Record<string, string>>;
    unitIds?: readonly string[];
    spaceIds?: readonly string[];
  };
  locationNames?: Readonly<Record<string, string>>;
  operationalTypeNames?: Readonly<Record<string, string>>;
}): string | null {
  const names = input.operationalTypeNames;
  const before = describeUserFacingScope({
    ...input.from,
    locationNames: input.locationNames,
    operationalTypeNames: input.from.operationalTypeNames ?? names,
  });
  const after = describeUserFacingScope({
    ...input.to,
    locationNames: input.locationNames,
    operationalTypeNames: input.to.operationalTypeNames ?? names,
  });
  if (before === after) return null;
  return `${before} → ${after}`;
}

export function diffMilestoneTimes(input: {
  prior: readonly CycleMilestoneTimeInput[];
  next: readonly CycleMilestoneTimeInput[];
  unitNames?: Readonly<Record<string, string>>;
  milestone?: ServeryMilestone;
}): { summaries: string[]; addedCount: number; changedCount: number; removedCount: number } {
  const milestone = input.milestone ?? "SERVICE_STARTED";
  const names = input.unitNames ?? {};
  const priorMap = new Map(
    input.prior
      .filter((row) => row.milestone === milestone)
      .map((row) => [row.unitId, normalizeConfiguredTime(row.configuredTime) ?? row.configuredTime]),
  );
  const nextMap = new Map(
    input.next
      .filter((row) => row.milestone === milestone)
      .map((row) => [row.unitId, normalizeConfiguredTime(row.configuredTime) ?? row.configuredTime]),
  );

  const summaries: string[] = [];
  let addedCount = 0;
  let changedCount = 0;
  let removedCount = 0;

  for (const [unitId, time] of nextMap) {
    const prior = priorMap.get(unitId);
    const label = names[unitId] ?? "Neighborhood";
    if (prior == null) {
      addedCount += 1;
      summaries.push(`${label} ${time}`);
    } else if (prior !== time) {
      changedCount += 1;
      summaries.push(`${label} ${prior} → ${time}`);
    }
  }
  for (const unitId of priorMap.keys()) {
    if (!nextMap.has(unitId)) {
      removedCount += 1;
      const label = names[unitId] ?? "Neighborhood";
      summaries.push(`${label} removed`);
    }
  }

  return { summaries, addedCount, changedCount, removedCount };
}

export function locationNameMap(
  locations: readonly CycleScopeLocationOption[],
): Record<string, string> {
  const names: Record<string, string> = {};
  for (const location of locations) {
    names[location.id] = location.name;
  }
  return names;
}

export function mealTimeNeighborhoodCandidates(input: {
  locationMode: OperationalCycleLocationMode;
  roomTypeKey?: string | null;
  unitIds?: readonly string[];
  spaceIds?: readonly string[];
  locations: readonly CycleScopeLocationOption[];
}): Array<{ unitId: string; name: string }> {
  const neighborhoods = input.locations.filter(
    (location) =>
      location.kind === "neighborhood" &&
      unitMayOwnConfiguredMealTime({ hierarchyRole: location.hierarchyRole }),
  );
  const byId = new Map(neighborhoods.map((row) => [row.id, row]));
  const rooms = input.locations.filter((location) => location.kind === "room");
  /** Names from room parent metadata when Neighborhood is not itself in the catalog. */
  const nameFromRooms = new Map<string, string>();
  for (const room of rooms) {
    const nid = room.neighborhoodId?.trim();
    if (!nid || nameFromRooms.has(nid)) continue;
    if (room.neighborhoodName?.trim()) nameFromRooms.set(nid, room.neighborhoodName.trim());
  }

  const ids: string[] = [];
  const add = (id: string | null | undefined, allowRoomDerived = false) => {
    if (!id || ids.includes(id)) return;
    if (byId.has(id)) {
      ids.push(id);
      return;
    }
    // Room Type / room-derived parents: include even when Neighborhood isn't a
    // separate department-responsible catalog row (common Dietary setup).
    if (allowRoomDerived && nameFromRooms.has(id)) {
      ids.push(id);
    }
  };

  if (input.locationMode === "ROOM_TYPE" && input.roomTypeKey) {
    for (const id of neighborhoodIdsFromScopedRooms(
      roomsMatchingRoomType(rooms, input.roomTypeKey),
    )) {
      add(id, true);
    }
  } else if (input.locationMode === "EXPLICIT_UNITS") {
    for (const unitId of input.unitIds ?? []) add(unitId);
    for (const spaceId of input.spaceIds ?? []) {
      add(rooms.find((room) => room.id === spaceId)?.neighborhoodId, true);
    }
  } else {
    for (const neighborhood of neighborhoods) add(neighborhood.id);
  }

  return ids.map((unitId) => ({
    unitId,
    name: byId.get(unitId)?.name ?? nameFromRooms.get(unitId) ?? unitId,
  }));
}

export function validateCycleScopeAgainstCatalog(input: {
  locationMode: OperationalCycleLocationMode;
  roomTypeKey?: string | null;
  applicableOperationalTypeKeys?: readonly string[];
  allowedOperationalTypeKeys?: readonly string[];
  unitIds?: readonly string[];
  spaceIds?: readonly string[];
  milestoneTimes?: readonly CycleMilestoneTimeInput[];
  cycleType: string;
  mealType?: string | null;
  expectedMilestones?: readonly string[];
  locations: readonly CycleScopeLocationOption[];
}): string[] {
  const errors: string[] = [];
  const unitIds = new Set(
    input.locations.filter((row) => row.kind === "neighborhood").map((row) => row.id),
  );
  const spaceIds = new Set(
    input.locations.filter((row) => row.kind === "room").map((row) => row.id),
  );

  if (input.locationMode === "OPERATIONAL_TYPES") {
    const allowed = new Set(input.allowedOperationalTypeKeys ?? []);
    const keys = (input.applicableOperationalTypeKeys ?? [])
      .map((key) => key.trim())
      .filter(Boolean);
    if (allowed.size > 0) {
      for (const key of keys) {
        if (!allowed.has(key)) {
          errors.push("Operational Type targets must belong to this department.");
          break;
        }
      }
    }
  }

  if (input.locationMode === "ROOM_TYPE") {
    const key = input.roomTypeKey?.trim() ?? "";
    if (!isStandardRoomTypeKey(key)) {
      errors.push("Room Type scope requires a standard Facility Room Type.");
    } else if (input.locations.some((row) => row.kind === "room")) {
      const matching = roomsMatchingRoomType(input.locations, key);
      if (matching.length === 0) {
        errors.push("Room Type scope does not resolve to any responsible rooms.");
      }
    }
  }

  if (input.locationMode === "EXPLICIT_UNITS") {
    for (const unitId of input.unitIds ?? []) {
      if (!unitIds.has(unitId)) {
        errors.push("Specific locations must belong to this department.");
        break;
      }
    }
    for (const spaceId of input.spaceIds ?? []) {
      if (!spaceIds.has(spaceId)) {
        errors.push("Specific locations must belong to this department.");
        break;
      }
    }
  }

  if (
    shouldShowServiceStartTimes({
      cycleType: input.cycleType,
      mealType: input.mealType,
      expectedMilestones: input.expectedMilestones ?? [],
    })
  ) {
    const candidates = new Set(
      mealTimeNeighborhoodCandidates(input).map((row) => row.unitId),
    );
    const floorIds = new Set(
      input.locations
        .filter((row) => row.hierarchyRole === "FLOOR" || row.hierarchyRole === "BUILDING")
        .map((row) => row.id),
    );
    for (const row of input.milestoneTimes ?? []) {
      if (floorIds.has(row.unitId) || !unitMayOwnConfiguredMealTime({
        hierarchyRole: input.locations.find((l) => l.id === row.unitId)?.hierarchyRole,
      })) {
        errors.push("Floors cannot own configured meal times.");
        break;
      }
      if (!candidates.has(row.unitId)) {
        errors.push("Configured times must belong to Neighborhoods in this cycle’s scope.");
        break;
      }
      if (!isValidConfiguredTime(row.configuredTime)) {
        errors.push("Configured service times must be valid clock times.");
        break;
      }
    }
  }

  return errors;
}

export function groupCyclesForList<T>(
  rows: readonly T[],
  headingFor: (row: T) => string,
): Array<{ heading: string; rows: T[] }> {
  const order: string[] = [];
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const heading = headingFor(row);
    if (!grouped.has(heading)) {
      grouped.set(heading, []);
      order.push(heading);
    }
    grouped.get(heading)!.push(row);
  }
  const preferred = [
    "Serveries",
    "Main Kitchen",
    "Retail",
    "Specific locations",
    "Entire department",
    "Legacy scope — edit to update",
  ];
  const sorted = [...order].sort((a, b) => {
    const ai = preferred.indexOf(a);
    const bi = preferred.indexOf(b);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return sorted.map((heading) => ({ heading, rows: grouped.get(heading) ?? [] }));
}

export function parseServiceStartTimesField(
  raw: string,
): CycleMilestoneTimeInput[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const rows: CycleMilestoneTimeInput[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const unitId = String((item as { unitId?: unknown }).unitId ?? "").trim();
      const configuredTime = normalizeConfiguredTime(
        String((item as { configuredTime?: unknown }).configuredTime ?? ""),
      );
      if (!unitId || !configuredTime) continue;
      rows.push({
        unitId,
        milestone: "SERVICE_STARTED",
        configuredTime,
      });
    }
    return rows;
  } catch {
    return [];
  }
}
