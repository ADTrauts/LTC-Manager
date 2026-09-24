/**
 * Department Builder location projection.
 *
 * Facility Builder owns physical structure and department responsibility.
 * Department Builder consumes actionable assignments only:
 * - Neighborhood / legacy Units via UnitDepartmentResponsibility
 * - Rooms (UnitSpace) via UnitSpaceResponsibility
 *
 * Buildings and Floors are STRUCTURAL — never ordinary operational department
 * locations, even when legacy UnitDepartmentResponsibility rows exist on them.
 * STAGED / undesignated locations are builder-only and excluded.
 *
 * Operational patterns are department-scoped and optional.
 * Neighborhoods do NOT use facility-wide Unit.unitType as a pattern.
 * Rooms may optionally show DepartmentRoomArchetype bindings.
 */

import type { SpaceType, UnitHierarchyRole, UnitType } from "@prisma/client";

import { resolveBuilderNodeDisplayKind } from "@/lib/facility-builder/builder-display";
import {
  resolveSpaceTypeDisplayLabel,
  roomTypeIdentity,
} from "@/lib/facility-builder/space-type-presets";

export type DepartmentLocationSource = "unit_responsibility" | "space_responsibility";

export type DepartmentLocationKind = "neighborhood" | "room";

/** Status for Locations UI — responsibility alone is enough to be valid. */
export type DepartmentLocationStatus = "assigned" | "pattern" | "custom";

export type DepartmentActionableLocation = {
  kind: DepartmentLocationKind;
  source: DepartmentLocationSource;
  /** Unit id (neighborhood) or UnitSpace id (room). */
  id: string;
  name: string;
  displayName: string;
  /** Structural floor name for hierarchy context only — never an operational location. */
  floorName: string | null;
  /** Parent unit id for rooms (neighborhood or floor attachment). */
  parentUnitId: string | null;
  /** Parent neighborhood name for rooms; null for neighborhood rows / floor-attached rooms. */
  parentNeighborhoodName: string | null;
  /** Parent neighborhood id when room sits under an actionable neighborhood. */
  parentNeighborhoodId: string | null;
  isActive: boolean;
  /**
   * Department-scoped operational pattern (room archetype) when bound.
   * Always null for neighborhoods in this pass — no neighborhood pattern model.
   */
  patternKey: string | null;
  patternLabel: string | null;
  /** True when a department-scoped room archetype is bound. */
  hasPattern: boolean;
  /** True when room experience exceptions exist. */
  hasOverrides: boolean;
  status: DepartmentLocationStatus;
  /**
   * Facility-wide Unit.unitType — informational only; never used as a department
   * operational pattern. Kept for debugging / future Facility semantics.
   */
  unitType: UnitType | null;
  hierarchyRole: UnitHierarchyRole | null;
  /** @deprecated Prefer roomTypeLabel — Facility-owned display label. */
  spaceTypeLabel: string | null;
  /** Canonical Room Type key (Facility preset key or custom:<label>). Null for neighborhoods. */
  roomTypeKey: string | null;
  /** Canonical Room Type label from Facility Builder. Null for neighborhoods. */
  roomTypeLabel: string | null;
  recommendedPatternKey: string | null;
};

/** Floor (or ungrouped) section for hierarchy-first Locations presentation. */
export type DepartmentLocationFloorGroup = {
  /** Floor unit id when known; null for ungrouped / top-level legacy. */
  floorId: string | null;
  floorName: string | null;
  neighborhoods: DepartmentLocationNeighborhoodNode[];
  /** Rooms attached directly under the floor (or with no neighborhood parent). */
  orphanRooms: DepartmentActionableLocation[];
};

export type DepartmentLocationNeighborhoodNode = {
  location: DepartmentActionableLocation;
  rooms: DepartmentActionableLocation[];
};

/**
 * Buildings and Floors are structural organizers — never Department Builder
 * operational locations. STAGED units are Facility Builder staging only.
 */
export function isActionableDepartmentUnit(input: {
  hierarchyRole: UnitHierarchyRole | null;
  parentUnitId: string | null;
}): boolean {
  const kind = resolveBuilderNodeDisplayKind({
    hierarchyRole: input.hierarchyRole,
    parentUnitId: input.parentUnitId,
  });
  return kind === "neighborhood" || kind === "legacy_location";
}

export function roomOperationalPattern(input: {
  archetypeKey: string | null;
  archetypeName: string | null;
}): {
  patternKey: string | null;
  patternLabel: string | null;
  hasPattern: boolean;
} {
  if (!input.archetypeKey || !input.archetypeName) {
    return { patternKey: null, patternLabel: null, hasPattern: false };
  }
  return {
    patternKey: `archetype:${input.archetypeKey}`,
    patternLabel: input.archetypeName,
    hasPattern: true,
  };
}

export function resolveLocationStatus(input: {
  kind: DepartmentLocationKind;
  hasPattern: boolean;
  hasOverrides: boolean;
}): DepartmentLocationStatus {
  if (input.hasOverrides) return "custom";
  if (input.kind === "room" && input.hasPattern) return "pattern";
  return "assigned";
}

export type HierarchyWalkUnit = {
  id: string;
  name: string;
  unitType: UnitType;
  hierarchyRole: UnitHierarchyRole | null;
  parentUnitId: string | null;
  isActive: boolean;
  /** Facility Builder unit displayOrder — walk/group must preserve this. */
  displayOrder?: number;
  departmentResponsibilities: readonly { department: { id: string } }[];
  childSpaces: readonly {
    id: string;
    name: string;
    displayName?: string;
    isActive: boolean;
    spaceTypeLabel?: string;
    /** Facility-owned physical SpaceType — display only. */
    spaceType?: SpaceType;
    customTypeLabel?: string | null;
    /** Facility Builder space sortOrder. */
    sortOrder?: number;
    responsibilities: readonly { department: { id: string } }[];
  }[];
  childUnits: readonly HierarchyWalkUnit[];
};

/** Same comparator Facility Builder uses after assembling the tree. */
function compareFacilityDisplayOrder(
  a: { displayOrder?: number; name: string },
  b: { displayOrder?: number; name: string },
): number {
  return (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name);
}

function orderedUnits(nodes: readonly HierarchyWalkUnit[]): readonly HierarchyWalkUnit[] {
  if (nodes.length <= 1) return nodes;
  if (!nodes.some((node) => node.displayOrder != null)) return nodes;
  return [...nodes].sort(compareFacilityDisplayOrder);
}

function orderedSpaces(
  spaces: HierarchyWalkUnit["childSpaces"],
): HierarchyWalkUnit["childSpaces"] {
  if (spaces.length <= 1) return spaces;
  if (!spaces.some((space) => space.sortOrder != null)) return spaces;
  return [...spaces].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
  );
}

function physicalSpaceTypeLabel(
  space: HierarchyWalkUnit["childSpaces"][number],
): string | null {
  if (space.spaceTypeLabel) return space.spaceTypeLabel;
  if (space.spaceType) {
    return resolveSpaceTypeDisplayLabel({
      spaceType: space.spaceType,
      customTypeLabel: space.customTypeLabel,
    });
  }
  return null;
}

function resolveLocationRoomType(
  space: HierarchyWalkUnit["childSpaces"][number],
  enrichment:
    | {
        spaceTypeLabel: string;
        spaceTypePresetKey?: string;
      }
    | undefined,
): { roomTypeKey: string | null; roomTypeLabel: string | null } {
  if (space.spaceType) {
    const identity = roomTypeIdentity({
      spaceType: space.spaceType,
      customTypeLabel: space.customTypeLabel,
    });
    return {
      roomTypeKey: identity.key,
      roomTypeLabel: enrichment?.spaceTypeLabel || identity.label,
    };
  }
  const label = enrichment?.spaceTypeLabel ?? physicalSpaceTypeLabel(space);
  const presetKey = enrichment?.spaceTypePresetKey;
  if (presetKey && presetKey !== "custom") {
    return { roomTypeKey: presetKey, roomTypeLabel: label };
  }
  if (label) {
    return { roomTypeKey: `custom:${label.trim().toLowerCase()}`, roomTypeLabel: label };
  }
  return { roomTypeKey: null, roomTypeLabel: null };
}

export type CollectDepartmentLocationsInput = {
  departmentId: string;
  units: readonly HierarchyWalkUnit[];
  /** Optional room enrichment from department-scoped archetype bindings. */
  roomPatternBySpaceId?: ReadonlyMap<
    string,
    {
      archetypeKey: string;
      archetypeName: string;
      exceptionCount: number;
      recommendedPatternKey: string | null;
      spaceTypeLabel: string;
      spaceTypePresetKey?: string;
      displayName: string;
    }
  >;
};

/**
 * Collect actionable department locations from Facility Builder hierarchy.
 * Does not mutate responsibility. Does not invent ownership.
 * Does not classify neighborhoods via Unit.unitType.
 */
export function collectDepartmentActionableLocations(
  input: CollectDepartmentLocationsInput,
): DepartmentActionableLocation[] {
  const out: DepartmentActionableLocation[] = [];

  function walk(
    nodes: readonly HierarchyWalkUnit[],
    floorName: string | null,
    neighborhoodName: string | null,
    neighborhoodId: string | null,
  ) {
    for (const node of orderedUnits(nodes)) {
      const kind = resolveBuilderNodeDisplayKind({
        hierarchyRole: node.hierarchyRole,
        parentUnitId: node.parentUnitId,
      });

      const nextFloor = kind === "floor" ? node.name : floorName;
      const isNeighborhoodLike =
        kind === "neighborhood" || kind === "legacy_location";
      const nextNeighborhood = isNeighborhoodLike ? node.name : neighborhoodName;
      const nextNeighborhoodId = isNeighborhoodLike ? node.id : neighborhoodId;

      const assignedToDepartment = node.departmentResponsibilities.some(
        (r) => r.department.id === input.departmentId,
      );

      // Structural buildings/floors never appear as operational locations — even with legacy rows.
      // STAGED never appears on operational surfaces.
      if (
        assignedToDepartment &&
        isActionableDepartmentUnit({
          hierarchyRole: node.hierarchyRole,
          parentUnitId: node.parentUnitId,
        })
      ) {
        out.push({
          kind: "neighborhood",
          source: "unit_responsibility",
          id: node.id,
          name: node.name,
          displayName: node.name,
          floorName: nextFloor,
          parentUnitId: node.parentUnitId,
          parentNeighborhoodName: null,
          parentNeighborhoodId: null,
          isActive: node.isActive,
          // Neighborhoods are department scopes — no pattern model in this pass.
          patternKey: null,
          patternLabel: null,
          hasPattern: false,
          hasOverrides: false,
          status: "assigned",
          unitType: node.unitType,
          hierarchyRole: node.hierarchyRole,
          spaceTypeLabel: null,
          roomTypeKey: null,
          roomTypeLabel: null,
          recommendedPatternKey: null,
        });
      }

      for (const space of orderedSpaces(node.childSpaces)) {
        if (!space.responsibilities.some((r) => r.department.id === input.departmentId)) {
          continue;
        }
        if (kind === "staged") continue;

        const enrichment = input.roomPatternBySpaceId?.get(space.id);
        const pattern = roomOperationalPattern({
          archetypeKey: enrichment?.archetypeKey ?? null,
          archetypeName: enrichment?.archetypeName ?? null,
        });
        const hasOverrides = (enrichment?.exceptionCount ?? 0) > 0;
        const type = resolveLocationRoomType(space, enrichment);
        out.push({
          kind: "room",
          source: "space_responsibility",
          id: space.id,
          name: space.name,
          displayName: enrichment?.displayName ?? space.displayName ?? space.name,
          floorName: nextFloor,
          parentUnitId: node.id,
          parentNeighborhoodName: isNeighborhoodLike ? node.name : nextNeighborhood,
          parentNeighborhoodId: isNeighborhoodLike ? node.id : nextNeighborhoodId,
          isActive: space.isActive,
          patternKey: pattern.patternKey,
          patternLabel: pattern.patternLabel,
          hasPattern: pattern.hasPattern,
          hasOverrides,
          status: resolveLocationStatus({
            kind: "room",
            hasPattern: pattern.hasPattern,
            hasOverrides,
          }),
          unitType: null,
          hierarchyRole: null,
          spaceTypeLabel: type.roomTypeLabel,
          roomTypeKey: type.roomTypeKey,
          roomTypeLabel: type.roomTypeLabel,
          recommendedPatternKey: enrichment?.recommendedPatternKey ?? null,
        });
      }

      if (node.childUnits.length > 0) {
        walk(node.childUnits, nextFloor, nextNeighborhood, nextNeighborhoodId);
      }
    }
  }

  walk(input.units, null, null, null);

  // Preserve Facility Builder walk order (displayOrder / sortOrder). Never alpha-sort the hierarchy.
  return out;
}

/**
 * Build hierarchy-first Locations sections: Floor → Neighborhoods → Rooms.
 * Floors are grouping headers only. Does not invent floor operational locations.
 *
 * When a Room is responsible but its parent Neighborhood is not, the Neighborhood
 * is synthesized as display context only (not added to coverage / actionable list).
 */
export function groupLocationsByPhysicalHierarchy(
  locations: readonly DepartmentActionableLocation[],
): DepartmentLocationFloorGroup[] {
  const floorOrder: string[] = [];
  const floorKey = (name: string | null) => name ?? "__none__";

  function rememberFloor(name: string | null) {
    const key = floorKey(name);
    if (!floorOrder.includes(key)) floorOrder.push(key);
  }

  for (const location of locations) {
    rememberFloor(location.floorName);
  }

  const neighborhoodById = new Map<string, DepartmentActionableLocation>();
  const neighborhoodOrderByFloor = new Map<string, string[]>();
  const roomsByNeighborhood = new Map<string, DepartmentActionableLocation[]>();
  const orphanRoomsByFloor = new Map<string, DepartmentActionableLocation[]>();

  function rememberNeighborhood(neighborhood: DepartmentActionableLocation) {
    if (neighborhoodById.has(neighborhood.id)) return;
    neighborhoodById.set(neighborhood.id, neighborhood);
    const key = floorKey(neighborhood.floorName);
    const order = neighborhoodOrderByFloor.get(key) ?? [];
    order.push(neighborhood.id);
    neighborhoodOrderByFloor.set(key, order);
  }

  function structuralNeighborhoodFromRoom(
    room: DepartmentActionableLocation,
  ): DepartmentActionableLocation {
    const id = room.parentNeighborhoodId!;
    const name = room.parentNeighborhoodName?.trim() || "Neighborhood";
    return {
      kind: "neighborhood",
      source: "unit_responsibility",
      id,
      name,
      displayName: name,
      floorName: room.floorName,
      parentUnitId: null,
      parentNeighborhoodName: null,
      parentNeighborhoodId: null,
      isActive: true,
      patternKey: null,
      patternLabel: null,
      hasPattern: false,
      hasOverrides: false,
      status: "assigned",
      unitType: null,
      hierarchyRole: "NEIGHBORHOOD",
      spaceTypeLabel: null,
      roomTypeKey: null,
      roomTypeLabel: null,
      recommendedPatternKey: null,
    };
  }

  // Single pass preserves Facility encounter order (including structural parents
  // introduced by the first responsible Room under a non-responsible Neighborhood).
  for (const location of locations) {
    if (location.kind === "neighborhood") {
      rememberNeighborhood(location);
      continue;
    }

    const parentId = location.parentNeighborhoodId;
    if (parentId) {
      if (!neighborhoodById.has(parentId)) {
        rememberNeighborhood(structuralNeighborhoodFromRoom(location));
      }
      const list = roomsByNeighborhood.get(parentId) ?? [];
      list.push(location);
      roomsByNeighborhood.set(parentId, list);
      continue;
    }

    const key = floorKey(location.floorName);
    const list = orphanRoomsByFloor.get(key) ?? [];
    list.push(location);
    orphanRoomsByFloor.set(key, list);
  }

  return floorOrder.map((key) => {
    const floorName = key === "__none__" ? null : key;
    const neighborhoodIds = neighborhoodOrderByFloor.get(key) ?? [];
    return {
      floorId: null,
      floorName,
      neighborhoods: neighborhoodIds.map((id) => ({
        location: neighborhoodById.get(id)!,
        rooms: roomsByNeighborhood.get(id) ?? [],
      })),
      orphanRooms: orphanRoomsByFloor.get(key) ?? [],
    };
  });
}

export function locationCoverageSummary(
  locations: readonly DepartmentActionableLocation[],
): {
  total: number;
  assigned: number;
  withPattern: number;
  withOverrides: number;
  neighborhoodCount: number;
  roomCount: number;
} {
  return {
    total: locations.length,
    assigned: locations.length,
    withPattern: locations.filter((l) => l.hasPattern).length,
    withOverrides: locations.filter((l) => l.hasOverrides).length,
    neighborhoodCount: locations.filter((l) => l.kind === "neighborhood").length,
    roomCount: locations.filter((l) => l.kind === "room").length,
  };
}
