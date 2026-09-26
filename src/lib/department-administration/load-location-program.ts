/**
 * Load composed Location Programs for rooms this department is responsible for.
 */

import {
  filterCatalogCardsToInstalled,
  listInstalledCatalogStableKeys,
  listPublishedCatalogBrowseCards,
} from "@/lib/canonical-logs";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { loadTeamsForDepartment } from "@/lib/department-teams";
import { prisma } from "@/lib/prisma";

import type { DepartmentActionableLocation } from "./department-locations";
import {
  composeLocationProgram,
  emptyLocationProgram,
  type LocationProgram,
} from "./location-program";

export type LocationProgramLoadResult = {
  programs: Record<string, LocationProgram>;
  catalogOptions: Array<{ stableKey: string; name: string }>;
  logsEnabled: boolean;
};

export type RuntimeProgramSpaceRow = {
  spaceId: string;
  name: string;
  departmentId: string;
  departmentLabel: string | null;
  neighborhoodName: string | null;
  floorName: string | null;
  facilityTypeLabel: string | null;
  facilityRoomTypeId: string | null;
};

type ProgramRoomInput = {
  spaceId: string;
  name: string;
  neighborhoodName: string | null;
  floorName: string | null;
  facilityTypeLabel: string | null;
  facilityRoomTypeId: string | null;
};

async function loadProgramsForDepartmentRooms(input: {
  facilityId: string;
  department: { id: string; name: string };
  rooms: readonly ProgramRoomInput[];
}): Promise<Record<string, LocationProgram>> {
  const spaceIds = input.rooms.map((room) => room.spaceId);
  const logsEnabled = isCanonicalLogsEnabled();

  const [teams, spaces, attachments, assets, typeDefaults, suppressions] = await Promise.all([
    loadTeamsForDepartment(prisma, {
      facilityId: input.facilityId,
      departmentId: input.department.id,
    }),
    spaceIds.length
      ? prisma.unitSpace.findMany({
          where: { id: { in: spaceIds }, facilityId: input.facilityId },
          select: {
            id: true,
            facilityRoomTypeId: true,
            facilityRoomType: { select: { id: true, displayName: true } },
          },
        })
      : Promise.resolve([]),
    logsEnabled && spaceIds.length
      ? prisma.logAttachment.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: input.department.id,
            status: "ACTIVE",
            OR: [
              { targetKind: "SPACE", spaceId: { in: spaceIds } },
              { targetKind: "ASSET", asset: { spaceId: { in: spaceIds } } },
            ],
          },
          select: {
            id: true,
            localDisplayLabel: true,
            targetKind: true,
            spaceId: true,
            assetId: true,
            catalogDefinition: { select: { name: true } },
            asset: { select: { name: true, spaceId: true } },
          },
        })
      : Promise.resolve([]),
    spaceIds.length
      ? prisma.asset.findMany({
          where: {
            spaceId: { in: spaceIds },
            retiredAt: null,
            unit: { facilityId: input.facilityId },
          },
          select: { id: true, name: true, assetCode: true, spaceId: true },
        })
      : Promise.resolve([]),
    logsEnabled
      ? prisma.departmentFacilityTypeLogDefault.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: input.department.id,
          },
          select: {
            id: true,
            facilityRoomTypeId: true,
            catalogDefinition: { select: { name: true } },
            facilityRoomType: { select: { displayName: true } },
          },
        })
      : Promise.resolve([]),
    logsEnabled && spaceIds.length
      ? prisma.departmentLocationLogSuppression.findMany({
          where: {
            departmentId: input.department.id,
            spaceId: { in: spaceIds },
          },
          select: { defaultId: true, spaceId: true },
        })
      : Promise.resolve([]),
  ]);

  const cycleIds = [
    ...new Set(
      teams.flatMap((team) =>
        team.cycles.map((cycle) => cycle.cycleId).filter((id): id is string => Boolean(id)),
      ),
    ),
  ];
  const placementRows =
    cycleIds.length > 0
      ? await prisma.departmentOperationalCycleLocation.findMany({
          where: { cycleId: { in: cycleIds }, spaceId: { in: spaceIds } },
          select: {
            spaceId: true,
            cycle: { select: { stableKey: true, label: true, startLocal: true, endLocal: true } },
          },
        })
      : [];

  const typeBySpace = new Map(
    spaces.map((row) => [
      row.id,
      {
        facilityRoomTypeId: row.facilityRoomTypeId,
        facilityTypeLabel: row.facilityRoomType?.displayName ?? null,
      },
    ]),
  );

  const teamInput = teams.map((team) => ({
    id: team.id,
    name: team.displayName,
    spaceIds: team.rooms.map((room) => room.spaceId),
  }));
  const teamCycles = teams.flatMap((team) =>
    team.cycles.map((cycle) => ({
      teamId: team.id,
      cycleStableKey: cycle.cycleStableKey,
      label: cycle.label,
      startLocal: cycle.startLocal,
      endLocal: cycle.endLocal,
      requiredCount: cycle.requiredCount,
      grain: cycle.grain,
    })),
  );
  const cyclePlacements = placementRows
    .filter((row) => row.spaceId)
    .map((row) => ({
      cycleStableKey: row.cycle.stableKey,
      label: row.cycle.label,
      startLocal: row.cycle.startLocal,
      endLocal: row.cycle.endLocal,
      spaceIds: [row.spaceId!],
    }));
  const typeDefaultInput = typeDefaults.map((row) => ({
    id: row.id,
    label: row.catalogDefinition.name,
    facilityRoomTypeId: row.facilityRoomTypeId,
    typeLabel: row.facilityRoomType.displayName,
  }));

  const programs: Record<string, LocationProgram> = {};
  for (const room of input.rooms) {
    const type = typeBySpace.get(room.spaceId);
    const spaceLogs = attachments
      .filter((row) => row.targetKind === "SPACE" && row.spaceId === room.spaceId)
      .map((row) => ({
        id: row.id,
        label: row.localDisplayLabel?.trim() || row.catalogDefinition.name,
      }));
    const assetLogs = attachments
      .filter((row) => row.targetKind === "ASSET" && row.asset?.spaceId === room.spaceId)
      .map((row) => ({
        id: row.id,
        label: row.localDisplayLabel?.trim() || row.catalogDefinition.name,
        assetName: row.asset?.name ?? "Asset",
      }));
    programs[room.spaceId] = composeLocationProgram({
      departmentId: input.department.id,
      departmentName: input.department.name,
      location: {
        spaceId: room.spaceId,
        name: room.name,
        neighborhoodName: room.neighborhoodName,
        floorName: room.floorName,
        facilityTypeLabel: type?.facilityTypeLabel ?? room.facilityTypeLabel,
        facilityRoomTypeId: type?.facilityRoomTypeId ?? room.facilityRoomTypeId,
        responsible: true,
      },
      teams: teamInput,
      teamCycles,
      cyclePlacements,
      spaceLogs,
      assetLogs,
      typeDefaults: typeDefaultInput,
      suppressions,
      assets: assets
        .filter((asset) => asset.spaceId === room.spaceId)
        .map((asset) => ({
          id: asset.id,
          name: asset.name,
          code: asset.assetCode,
        })),
    });
  }

  return programs;
}

export async function loadLocationPrograms(input: {
  facilityId: string;
  department: { id: string; name: string };
  locations: readonly DepartmentActionableLocation[];
}): Promise<LocationProgramLoadResult> {
  const rooms = input.locations
    .filter((location) => location.kind === "room")
    .map((location) => ({
      spaceId: location.id,
      name: location.displayName,
      neighborhoodName: location.parentNeighborhoodName,
      floorName: location.floorName,
      facilityTypeLabel: location.roomTypeLabel,
      facilityRoomTypeId: null,
    }));
  const logsEnabled = isCanonicalLogsEnabled();
  const [programs, catalogCards, installedStableKeys] = await Promise.all([
    loadProgramsForDepartmentRooms({
      facilityId: input.facilityId,
      department: input.department,
      rooms,
    }),
    logsEnabled ? listPublishedCatalogBrowseCards(prisma) : Promise.resolve([]),
    logsEnabled ? listInstalledCatalogStableKeys(prisma, input.facilityId) : Promise.resolve([]),
  ]);

  return {
    programs,
    catalogOptions: filterCatalogCardsToInstalled(catalogCards, installedStableKeys).map((card) => ({
      stableKey: card.stableKey,
      name: card.name,
    })),
    logsEnabled,
  };
}

export async function loadLocationProgramsForRuntimeSpaces(input: {
  facilityId: string;
  spaces: readonly RuntimeProgramSpaceRow[];
}): Promise<Map<string, LocationProgram>> {
  const programs = new Map<string, LocationProgram>();
  const byDepartment = new Map<string, RuntimeProgramSpaceRow[]>();
  for (const space of input.spaces) {
    if (!space.departmentId) {
      programs.set(
        space.spaceId,
        emptyLocationProgram({
          departmentId: "",
          departmentName: space.departmentLabel ?? "",
          spaceId: space.spaceId,
          name: space.name,
          neighborhoodName: space.neighborhoodName,
          floorName: space.floorName,
          facilityTypeLabel: space.facilityTypeLabel,
          facilityRoomTypeId: space.facilityRoomTypeId,
        }),
      );
      continue;
    }
    const list = byDepartment.get(space.departmentId) ?? [];
    list.push(space);
    byDepartment.set(space.departmentId, list);
  }

  const departmentIds = [...byDepartment.keys()];
  const departments =
    departmentIds.length === 0
      ? []
      : await prisma.department.findMany({
          where: { id: { in: departmentIds }, facilityId: input.facilityId },
          select: { id: true, name: true },
        });
  const departmentName = new Map(departments.map((row) => [row.id, row.name]));

  const loaded = await Promise.all(
    departmentIds.map((departmentId) => {
      const rooms = byDepartment.get(departmentId) ?? [];
      return loadProgramsForDepartmentRooms({
        facilityId: input.facilityId,
        department: {
          id: departmentId,
          name: departmentName.get(departmentId) ?? rooms[0]?.departmentLabel ?? "Department",
        },
        rooms: rooms.map((space) => ({
          spaceId: space.spaceId,
          name: space.name,
          neighborhoodName: space.neighborhoodName,
          floorName: space.floorName,
          facilityTypeLabel: space.facilityTypeLabel,
          facilityRoomTypeId: space.facilityRoomTypeId,
        })),
      });
    }),
  );

  for (const batch of loaded) {
    for (const [spaceId, program] of Object.entries(batch)) {
      programs.set(spaceId, program);
    }
  }

  return programs;
}
