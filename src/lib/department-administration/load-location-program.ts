/**
 * Load composed Location Programs for rooms this department is responsible for.
 */

import {
  filterCatalogCardsToInstalled,
  listInstalledCatalogStableKeys,
  listPublishedCatalogBrowseCards,
} from "@/lib/canonical-logs";
import { isCanonicalLogsEnabled, isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";
import { selectRuntimeCoverageTemplates } from "@/lib/scheduling/coverage-expectations";

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

  const serviceDateKey = toServiceDateKey(
    getFacilityServiceDate(await loadFacilityTimezone(prisma, input.facilityId)),
  );
  const [spaces, attachments, assets, coverageTemplates, periodCycles, menus] = await Promise.all([
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
    prisma.operationalAssignmentTemplate.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.department.id,
      },
      select: {
        id: true,
        stableKey: true,
        version: true,
        status: true,
        isActive: true,
        effectiveFrom: true,
        effectiveTo: true,
        items: {
          where: spaceIds.length ? { spaceId: { in: spaceIds } } : { id: "__none__" },
          select: {
            id: true,
            roleKey: true,
            roleLabel: true,
            requiredCount: true,
            unitId: true,
            spaceId: true,
            applicableOperationalCycleStableKeys: true,
          },
        },
      },
    }),
    prisma.departmentOperationalCycle.findMany({
      where: {
        facilityId: input.facilityId,
        departmentId: input.department.id,
        nodeKind: "PERIOD",
        status: "PUBLISHED",
      },
      select: { stableKey: true, label: true },
    }),
    spaceIds.length
      ? prisma.menu.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: input.department.id,
            status: "ACTIVE",
            locationApplicability: { some: { spaceId: { in: spaceIds } } },
          },
          select: {
            id: true,
            name: true,
            locationApplicability: { select: { spaceId: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const placementRows =
    spaceIds.length > 0
      ? await prisma.departmentOperationalCycleLocation.findMany({
          where: {
            spaceId: { in: spaceIds },
            cycle: {
              facilityId: input.facilityId,
              departmentId: input.department.id,
              status: "PUBLISHED",
              nodeKind: "PERIOD",
            },
          },
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

  const cycleLabelByKey = new Map(periodCycles.map((cycle) => [cycle.stableKey, cycle.label]));
  const runtimeCoverage = selectRuntimeCoverageTemplates(coverageTemplates, serviceDateKey);
  const coverageBySpace = new Map<
    string,
    Array<{ id: string; roleLabel: string; requiredCount: number; cycleLabel: string | null }>
  >();
  for (const template of runtimeCoverage) {
    for (const item of template.items) {
      if (!item.spaceId) continue;
      const labels = item.applicableOperationalCycleStableKeys.length
        ? item.applicableOperationalCycleStableKeys.map((key) => cycleLabelByKey.get(key) ?? key)
        : [null];
      const list = coverageBySpace.get(item.spaceId) ?? [];
      for (const cycleLabel of labels) {
        list.push({
          id: `${item.id}:${cycleLabel ?? "any"}`,
          roleLabel: item.roleLabel,
          requiredCount: item.requiredCount,
          cycleLabel,
        });
      }
      coverageBySpace.set(item.spaceId, list);
    }
  }

  const teamInput: Array<{ id: string; name: string; spaceIds: string[] }> = [];
  const teamCycles: Array<{
    teamId: string;
    cycleStableKey: string;
    label: string;
    startLocal: string | null;
    endLocal: string | null;
    requiredCount: number | null;
    grain: "TOTAL" | "PER_ROOM";
  }> = [];
  const cyclePlacements = placementRows
    .filter((row) => row.spaceId)
    .map((row) => ({
      cycleStableKey: row.cycle.stableKey,
      label: row.cycle.label,
      startLocal: row.cycle.startLocal,
      endLocal: row.cycle.endLocal,
      spaceIds: [row.spaceId!],
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
      coverageNeeds: coverageBySpace.get(room.spaceId) ?? [],
      spaceLogs,
      assetLogs,
      typeDefaults: [],
      suppressions: [],
      assets: assets
        .filter((asset) => asset.spaceId === room.spaceId)
        .map((asset) => ({
          id: asset.id,
          name: asset.name,
          code: asset.assetCode,
        })),
      menus: menus
        .filter((menu) =>
          menu.locationApplicability.some((row) => row.spaceId === room.spaceId),
        )
        .map((menu) => ({ id: menu.id, name: menu.name })),
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
    logsEnabled
      ? listPublishedCatalogBrowseCards(
          prisma,
          isContractedDepartmentAuthorityEnabled() ? { ownerKind: "VSSYL" } : {},
        )
      : Promise.resolve([]),
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
