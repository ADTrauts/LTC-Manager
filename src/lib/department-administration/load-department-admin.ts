/**
 * Department Administration view loader (Wave 14C).
 * Assembles Wave 14B snapshots + Facility Builder hierarchy for the UI.
 * No Projection. No runtime operational data.
 */

import { recommendArchetypeKey } from "@/lib/department-administration/archetype-recommendation";
import {
  validateProfileForCertification,
  type CertificationResult,
} from "@/lib/department-administration/certification";
import {
  collectDepartmentActionableLocations,
  groupLocationsByPhysicalHierarchy,
  locationCoverageSummary,
  type DepartmentActionableLocation,
  type DepartmentLocationFloorGroup,
} from "@/lib/department-administration/department-locations";
import type {
  ProfileSnapshot,
  RoomArchetypeBindingSnapshot,
  RoomContext,
  RoomExceptionSnapshot,
} from "@/lib/department-administration/profile-types";
import { isRoomStagedOrUndesignated } from "@/lib/department-administration/profile-types";
import {
  formatRoomDisplayName,
  loadFacilityHierarchy,
  type FacilityHierarchy,
  type UnitHierarchyNode,
} from "@/lib/facility-builder/load-facility-hierarchy";
import { findPresetForStoredSpace } from "@/lib/facility-builder/space-type-presets";
import { resolveSpaceTypeDisplayLabel } from "@/lib/facility-builder/space-type-presets";
import { prisma } from "@/lib/prisma";

export type ProfileListItem = {
  id: string;
  name: string;
  version: number;
  status: "DRAFT" | "CERTIFIED" | "ACTIVE" | "RETIRED";
  baselineKey: string | null;
  certifiedAt: Date | null;
  activatedAt: Date | null;
  retiredAt: Date | null;
  createdAt: Date;
};

export type DepartmentRoomRow = {
  unitSpaceId: string;
  name: string;
  displayName: string;
  spaceTypeLabel: string;
  spaceTypePresetKey: string;
  floorName: string | null;
  neighborhoodName: string | null;
  isActive: boolean;
  binding: {
    archetypeId: string;
    archetypeKey: string;
    archetypeName: string;
  } | null;
  recommendedArchetypeKey: string | null;
  exceptionCount: number;
};

export type DepartmentAdminView = {
  department: { id: string; key: string; name: string; isActive: boolean };
  facilityId: string;
  vocabulary: FacilityHierarchy["vocabulary"];
  profiles: ProfileListItem[];
  workingProfile: ProfileSnapshot | null;
  workingProfileMeta: ProfileListItem | null;
  editable: boolean;
  certification: CertificationResult | null;
  /** @deprecated Prefer `locations` — room-only slice kept for Rooms panel compatibility. */
  rooms: DepartmentRoomRow[];
  /** Actionable locations from Facility Builder (neighborhoods + rooms; no floors). */
  locations: DepartmentActionableLocation[];
  /** Hierarchy-first grouping for the Locations tab. */
  locationHierarchy: DepartmentLocationFloorGroup[];
  locationCoverage: ReturnType<typeof locationCoverageSummary>;
  /** Working-profile bindings — used by Effective Location Program. */
  roomBindings: RoomArchetypeBindingSnapshot[];
  roomExceptions: RoomExceptionSnapshot[];
  coverage: {
    assignedRooms: number;
    mappedRooms: number;
    unmappedRooms: number;
    activeExperiences: number;
    activeAreas: number;
    activeArchetypes: number;
  };
};

function walkAssignedRooms(
  nodes: UnitHierarchyNode[],
  departmentId: string,
  floorName: string | null,
  neighborhoodName: string | null,
  out: Array<{
    space: UnitHierarchyNode["childSpaces"][number];
    floorName: string | null;
    neighborhoodName: string | null;
  }>,
): void {
  for (const node of nodes) {
    const isFloor = node.hierarchyRole === "FLOOR";
    const nextFloor = isFloor ? node.name : floorName;
    const nextNeighborhood =
      node.hierarchyRole === "NEIGHBORHOOD" ? node.name : neighborhoodName;

    for (const space of node.childSpaces) {
      if (!space.responsibilities.some((r) => r.department.id === departmentId)) {
        continue;
      }
      out.push({
        space,
        floorName: nextFloor,
        neighborhoodName: nextNeighborhood,
      });
    }

    if (node.childUnits.length > 0) {
      walkAssignedRooms(node.childUnits, departmentId, nextFloor, nextNeighborhood, out);
    }
  }
}

function toRoomContexts(
  rooms: DepartmentRoomRow[],
  departmentId: string,
  facilityId: string,
  hierarchySpaces: Map<
    string,
    {
      unitId: string | null;
      parentHierarchyRole: RoomContext["parentHierarchyRole"];
      isActive: boolean;
    }
  >,
): RoomContext[] {
  return rooms.map((room) => {
    const meta = hierarchySpaces.get(room.unitSpaceId);
    return {
      id: room.unitSpaceId,
      facilityId,
      isActive: meta?.isActive ?? room.isActive,
      unitId: meta?.unitId ?? "placed",
      parentHierarchyRole: meta?.parentHierarchyRole ?? "NEIGHBORHOOD",
      assignedDepartmentIds: [departmentId],
    };
  });
}

/**
 * Pick the working profile for the UI:
 * explicit ?profile= → that version; else DRAFT → ACTIVE → latest CERTIFIED → latest.
 */
export function selectWorkingProfileId(
  profiles: readonly ProfileListItem[],
  requestedProfileId: string | null | undefined,
): string | null {
  if (profiles.length === 0) return null;
  if (requestedProfileId && profiles.some((p) => p.id === requestedProfileId)) {
    return requestedProfileId;
  }
  const draft = profiles.find((p) => p.status === "DRAFT");
  if (draft) return draft.id;
  const active = profiles.find((p) => p.status === "ACTIVE");
  if (active) return active.id;
  const certified = profiles.find((p) => p.status === "CERTIFIED");
  if (certified) return certified.id;
  return profiles[0]!.id;
}

export function experienceDisplayName(experienceKey: string): string {
  return experienceKey.replaceAll("_", " ");
}

export async function loadDepartmentAdminView(input: {
  facilityId: string;
  departmentId: string;
  requestedProfileId?: string | null;
}): Promise<DepartmentAdminView | null> {
  const department = await prisma.department.findFirst({
    where: {
      id: input.departmentId,
      facilityId: input.facilityId,
      isActive: true,
    },
    select: { id: true, key: true, name: true, isActive: true },
  });
  if (!department) return null;

  const hierarchy = await loadFacilityHierarchy(input.facilityId);
  const profiles: ProfileListItem[] = [];

  const workingId = selectWorkingProfileId(profiles, input.requestedProfileId);
  let workingProfile: ProfileSnapshot | null = null;
  let workingProfileMeta: ProfileListItem | null = null;
  let bindings: RoomArchetypeBindingSnapshot[] = [];
  let exceptions: RoomExceptionSnapshot[] = [];
  void workingId;

  const assigned: Array<{
    space: UnitHierarchyNode["childSpaces"][number];
    floorName: string | null;
    neighborhoodName: string | null;
  }> = [];
  walkAssignedRooms(hierarchy.units, department.id, null, null, assigned);

  const hierarchySpaceMeta = new Map<
    string,
    {
      unitId: string | null;
      parentHierarchyRole: RoomContext["parentHierarchyRole"];
      isActive: boolean;
    }
  >();

  function collectMeta(nodes: UnitHierarchyNode[]) {
    for (const node of nodes) {
      for (const space of node.childSpaces) {
        hierarchySpaceMeta.set(space.id, {
          unitId: space.unitId,
          parentHierarchyRole: node.hierarchyRole,
          isActive: space.isActive,
        });
      }
      collectMeta(node.childUnits);
    }
  }
  collectMeta(hierarchy.units);

  const archetypeById = new Map<string, { id: string; key: string; name: string }>();
  const bindingByRoom = new Map(bindings.map((b) => [b.unitSpaceId, b]));
  const exceptionCountByRoom = new Map<string, number>();
  for (const exception of exceptions) {
    exceptionCountByRoom.set(
      exception.unitSpaceId,
      (exceptionCountByRoom.get(exception.unitSpaceId) ?? 0) + 1,
    );
  }

  const rooms: DepartmentRoomRow[] = assigned
    .filter(({ space }) => {
      const meta = hierarchySpaceMeta.get(space.id);
      if (!meta) return false;
      return !isRoomStagedOrUndesignated({
        id: space.id,
        facilityId: input.facilityId,
        isActive: space.isActive,
        unitId: meta.unitId,
        parentHierarchyRole: meta.parentHierarchyRole,
        assignedDepartmentIds: [department.id],
      });
    })
    .map(({ space, floorName, neighborhoodName }) => {
      const preset = findPresetForStoredSpace({
        spaceType: space.spaceType,
        customTypeLabel: space.customTypeLabel,
      });
      const binding = bindingByRoom.get(space.id);
      const archetype = binding ? archetypeById.get(binding.archetypeId) : null;
      return {
        unitSpaceId: space.id,
        name: space.name,
        displayName: formatRoomDisplayName(space),
        spaceTypeLabel: resolveSpaceTypeDisplayLabel({
          spaceType: space.spaceType,
          customTypeLabel: space.customTypeLabel,
        }),
        spaceTypePresetKey: preset.key,
        floorName,
        neighborhoodName,
        isActive: space.isActive,
        binding: archetype
          ? {
              archetypeId: archetype.id,
              archetypeKey: archetype.key,
              archetypeName: archetype.name,
            }
          : null,
        recommendedArchetypeKey:
          recommendArchetypeKey(department.key, preset.key) ?? null,
        exceptionCount: exceptionCountByRoom.get(space.id) ?? 0,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const certification: CertificationResult | null = null;

  const mappedRooms = 0;
  const activeExperiences = 0;

  const roomPatternBySpaceId = new Map<
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
  >();
  for (const room of rooms) {
    roomPatternBySpaceId.set(room.unitSpaceId, {
      archetypeKey: room.binding?.archetypeKey ?? "",
      archetypeName: room.binding?.archetypeName ?? "",
      exceptionCount: room.exceptionCount,
      recommendedPatternKey: room.recommendedArchetypeKey,
      spaceTypeLabel: room.spaceTypeLabel,
      spaceTypePresetKey: room.spaceTypePresetKey,
      displayName: room.displayName,
    });
  }

  const locations = collectDepartmentActionableLocations({
    departmentId: department.id,
    units: hierarchy.units,
    roomPatternBySpaceId,
  });

  const locationHierarchy = groupLocationsByPhysicalHierarchy(locations);
  const locationCoverage = locationCoverageSummary(locations);

  return {
    department,
    facilityId: input.facilityId,
    vocabulary: hierarchy.vocabulary,
    profiles,
    workingProfile,
    workingProfileMeta,
    editable: false,
    certification,
    rooms,
    locations,
    locationHierarchy,
    locationCoverage,
    roomBindings: bindings,
    roomExceptions: exceptions,
    coverage: {
      assignedRooms: rooms.length,
      mappedRooms,
      unmappedRooms: rooms.length - mappedRooms,
      activeExperiences,
      activeAreas: 0,
      activeArchetypes: 0,
    },
  };
}

/**
 * Lightweight Department Builder view when Operational Profiles are off.
 * Still consumes Facility Builder responsibility for the Locations tab.
 */
export async function loadDepartmentLocationsView(input: {
  facilityId: string;
  departmentId: string;
}): Promise<{
  department: { id: string; key: string; name: string; isActive: boolean };
  facilityId: string;
  vocabulary: FacilityHierarchy["vocabulary"];
  locations: DepartmentActionableLocation[];
  locationHierarchy: DepartmentLocationFloorGroup[];
  locationCoverage: ReturnType<typeof locationCoverageSummary>;
} | null> {
  const department = await prisma.department.findFirst({
    where: {
      id: input.departmentId,
      facilityId: input.facilityId,
      isActive: true,
    },
    select: { id: true, key: true, name: true, isActive: true },
  });
  if (!department) return null;

  const hierarchy = await loadFacilityHierarchy(input.facilityId);
  const locations = collectDepartmentActionableLocations({
    departmentId: department.id,
    units: hierarchy.units,
  });

  return {
    department,
    facilityId: input.facilityId,
    vocabulary: hierarchy.vocabulary,
    locations,
    locationHierarchy: groupLocationsByPhysicalHierarchy(locations),
    locationCoverage: locationCoverageSummary(locations),
  };
}
