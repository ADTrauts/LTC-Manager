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
  loadProfile,
  toProfileSnapshot,
} from "@/lib/department-administration/profile-service";
import type {
  ProfileSnapshot,
  RoomArchetypeBindingSnapshot,
  RoomContext,
  RoomExceptionSnapshot,
} from "@/lib/department-administration/profile-types";
import { isRoomStagedOrUndesignated } from "@/lib/department-administration/profile-types";
import { getExperience } from "@/lib/experiences";
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
  rooms: DepartmentRoomRow[];
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
    const isFloor = node.hierarchyRole === "FLOOR" || (!node.parentUnitId && node.hierarchyRole !== "NEIGHBORHOOD");
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
  return getExperience(experienceKey)?.name ?? experienceKey;
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

  const [profileRows, hierarchy] = await Promise.all([
    prisma.departmentOperationalProfile.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: department.id,
      },
      orderBy: [{ version: "desc" }],
      select: {
        id: true,
        name: true,
        version: true,
        status: true,
        baselineKey: true,
        certifiedAt: true,
        activatedAt: true,
        retiredAt: true,
        createdAt: true,
      },
    }),
    loadFacilityHierarchy(input.facilityId),
  ]);

  const profiles: ProfileListItem[] = profileRows.map((row) => ({
    id: row.id,
    name: row.name,
    version: row.version,
    status: row.status,
    baselineKey: row.baselineKey,
    certifiedAt: row.certifiedAt,
    activatedAt: row.activatedAt,
    retiredAt: row.retiredAt,
    createdAt: row.createdAt,
  }));

  const workingId = selectWorkingProfileId(profiles, input.requestedProfileId);
  let workingProfile: ProfileSnapshot | null = null;
  let workingProfileMeta: ProfileListItem | null = null;
  let bindings: RoomArchetypeBindingSnapshot[] = [];
  let exceptions: RoomExceptionSnapshot[] = [];
  let loaded: Awaited<ReturnType<typeof loadProfile>> | null = null;

  if (workingId) {
    loaded = await loadProfile(workingId);
    workingProfile = toProfileSnapshot(loaded);
    workingProfileMeta = profiles.find((p) => p.id === workingId) ?? null;
    bindings = loaded.roomBindings.map((b) => ({
      id: b.id,
      unitSpaceId: b.unitSpaceId,
      archetypeId: b.archetypeId,
    }));
    exceptions = loaded.roomExceptions.map((e) => ({
      id: e.id,
      unitSpaceId: e.unitSpaceId,
      areaExperienceId: e.areaExperienceId,
      mode: e.mode,
      configuration: null,
      reason: e.reason,
    }));
  }

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

  const archetypeById = new Map(
    (workingProfile?.archetypes ?? []).map((a) => [a.id, a]),
  );
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

  let certification: CertificationResult | null = null;
  if (workingProfile && loaded) {
    const roomContexts = toRoomContexts(
      rooms,
      department.id,
      input.facilityId,
      hierarchySpaceMeta,
    );
    // Include bound rooms that might not be in the assigned list (should not happen).
    for (const binding of bindings) {
      if (!roomContexts.some((r) => r.id === binding.unitSpaceId)) {
        const meta = hierarchySpaceMeta.get(binding.unitSpaceId);
        roomContexts.push({
          id: binding.unitSpaceId,
          facilityId: input.facilityId,
          isActive: meta?.isActive ?? true,
          unitId: meta?.unitId ?? null,
          parentHierarchyRole: meta?.parentHierarchyRole ?? null,
          assignedDepartmentIds: [department.id],
        });
      }
    }

    certification = validateProfileForCertification({
      profile: workingProfile,
      bindings,
      exceptions: loaded.roomExceptions.map((e) => ({
        id: e.id,
        unitSpaceId: e.unitSpaceId,
        areaExperienceId: e.areaExperienceId,
        mode: e.mode,
        configuration:
          e.configurationJson &&
          typeof e.configurationJson === "object" &&
          !Array.isArray(e.configurationJson)
            ? (e.configurationJson as Record<string, string | number | boolean | readonly string[] | readonly number[]>)
            : null,
        reason: e.reason,
      })),
      rooms: roomContexts,
      facility: { id: input.facilityId },
      department: {
        id: department.id,
        facilityId: input.facilityId,
        isActive: department.isActive,
      },
    });
  }

  const mappedRooms = rooms.filter((r) => r.binding).length;
  const activeExperiences = workingProfile
    ? workingProfile.areas
        .filter((a) => a.isActive)
        .flatMap((a) => a.experiences.filter((e) => e.isActive)).length
    : 0;

  return {
    department,
    facilityId: input.facilityId,
    vocabulary: hierarchy.vocabulary,
    profiles,
    workingProfile,
    workingProfileMeta,
    editable: workingProfileMeta?.status === "DRAFT",
    certification,
    rooms,
    coverage: {
      assignedRooms: rooms.length,
      mappedRooms,
      unmappedRooms: rooms.length - mappedRooms,
      activeExperiences,
      activeAreas: workingProfile?.areas.filter((a) => a.isActive).length ?? 0,
      activeArchetypes:
        workingProfile?.archetypes.filter((a) => a.isActive).length ?? 0,
    },
  };
}
