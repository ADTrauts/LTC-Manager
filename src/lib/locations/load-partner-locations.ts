import type { Prisma, PrismaClient } from "@prisma/client";

import { EXPERIENCE_REGISTRY_VERSION } from "@/lib/experiences";
import {
  buildDepartmentLens,
  buildProjectionRequest,
  resolveProjection,
  type ProjectionLocationNode,
  type ProjectionSource,
  type ProjectionSourceLocation,
} from "@/lib/projection";

type Db = PrismaClient | Prisma.TransactionClient;

export type PartnerLocationNode = {
  id: string;
  label: string;
  secondaryLabel: string | null;
  physicalType: string | null;
  presentation: "ACTIONABLE" | "STRUCTURAL";
  kind: "BUILDING" | "FLOOR" | "NEIGHBORHOOD" | "LEGACY" | "ROOM";
  children: PartnerLocationNode[];
};

export type PartnerLocationUnitRow = {
  id: string;
  facilityId: string;
  name: string;
  parentUnitId: string | null;
  hierarchyRole: string | null;
  displayOrder: number;
  isActive: boolean;
};

export type PartnerLocationRoomRow = {
  id: string;
  facilityId: string;
  name: string;
  roomNumber: string | null;
  spaceType: string;
  unitId: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type PartnerLocationProjection = {
  departmentName: string;
  roots: PartnerLocationNode[];
};

function hierarchyRole(role: string | null): "BUILDING" | "FLOOR" | "NEIGHBORHOOD" | "LEGACY" {
  if (role === "BUILDING" || role === "FLOOR" || role === "NEIGHBORHOOD") return role;
  return "LEGACY";
}

function parentRole(
  role: string | null,
): "BUILDING" | "FLOOR" | "NEIGHBORHOOD" | "LEGACY_LOCATION" | "STAGED" | null {
  if (role === "BUILDING" || role === "FLOOR" || role === "NEIGHBORHOOD") return role;
  if (role === "LEGACY") return "LEGACY_LOCATION";
  if (role === "STAGED") return "STAGED";
  return null;
}

function toPartnerNode(node: ProjectionLocationNode, rooms: Map<string, PartnerLocationRoomRow>): PartnerLocationNode | null {
  if (node.reference.kind === "FACILITY") return null;
  const room = node.reference.kind === "SPACE" ? rooms.get(node.reference.spaceId) : undefined;
  const kind =
    node.reference.kind === "SPACE"
      ? "ROOM"
      : node.reference.kind === "UNIT"
        ? node.reference.hierarchyRole === "BUILDING"
          ? "BUILDING"
          : node.reference.hierarchyRole === "FLOOR"
            ? "FLOOR"
            : node.reference.hierarchyRole === "NEIGHBORHOOD"
              ? "NEIGHBORHOOD"
              : "LEGACY"
        : "LEGACY";
  return {
    id: node.reference.kind === "SPACE" ? node.reference.spaceId : node.reference.kind === "UNIT" ? node.reference.unitId : node.id,
    label: node.label,
    secondaryLabel: room?.roomNumber?.trim() || null,
    physicalType: room?.spaceType ?? null,
    presentation: node.presentation,
    kind,
    children: node.children
      .map((child) => toPartnerNode(child, rooms))
      .filter((child): child is PartnerLocationNode => Boolean(child)),
  };
}

/**
 * Department-scoped location tree.
 * Rooms come only from explicit UnitSpaceResponsibility.
 * Neighborhoods come only from explicit UnitDepartmentResponsibility.
 * Ancestors are structural context. Plant facility-wide coverage is not an input.
 */
export function projectPartnerLocations(input: {
  facilityId: string;
  departmentId: string;
  departmentKey: string;
  departmentName: string;
  units: readonly PartnerLocationUnitRow[];
  rooms: readonly PartnerLocationRoomRow[];
  responsibleUnitIds: readonly string[];
  responsibleRoomIds: readonly string[];
}): PartnerLocationProjection {
  const departmentId = input.departmentId.trim();
  if (!departmentId) {
    throw new Error("Partner Locations require one Department.");
  }
  const facilityId = input.facilityId.trim();
  if (!facilityId) {
    throw new Error("Partner Locations require a Facility.");
  }

  const unitsInFacility = input.units.filter((unit) => unit.facilityId === facilityId && unit.isActive);
  const unitByIdAll = new Map(unitsInFacility.map((unit) => [unit.id, unit]));
  const keep = new Set<string>();
  const mark = (unitId: string | null | undefined) => {
    let cursor = unitId ? unitByIdAll.get(unitId) : undefined;
    while (cursor) {
      if (keep.has(cursor.id)) break;
      keep.add(cursor.id);
      cursor = cursor.parentUnitId ? unitByIdAll.get(cursor.parentUnitId) : undefined;
    }
  };
  for (const unitId of input.responsibleUnitIds) mark(unitId);
  for (const room of input.rooms) {
    if (input.responsibleRoomIds.includes(room.id)) mark(room.unitId);
  }
  const units = unitsInFacility.filter((unit) => keep.has(unit.id));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const responsibleUnits = new Set(
    input.responsibleUnitIds.filter((id) => {
      const unit = unitById.get(id);
      if (!unit) return false;
      return unit.hierarchyRole === "NEIGHBORHOOD" || unit.hierarchyRole === "LEGACY" || unit.hierarchyRole === null;
    }),
  );
  const responsibleRooms = new Set(input.responsibleRoomIds);
  const rooms = input.rooms.filter(
    (room) =>
      room.facilityId === facilityId &&
      room.isActive &&
      room.unitId &&
      responsibleRooms.has(room.id) &&
      unitById.has(room.unitId),
  );

  const locations: ProjectionSourceLocation[] = units.map((unit) => ({
    id: `unit:${unit.id}`,
    reference: {
      kind: "UNIT",
      facilityId,
      unitId: unit.id,
      hierarchyRole: hierarchyRole(unit.hierarchyRole),
    },
    parentId: unit.parentUnitId && unitById.has(unit.parentUnitId) ? `unit:${unit.parentUnitId}` : null,
    label: unit.name,
    isActive: true,
    isPlaced: true,
    displayOrder: unit.displayOrder,
  }));

  for (const room of rooms) {
    const parent = unitById.get(room.unitId!);
    locations.push({
      id: `space:${room.id}`,
      reference: {
        kind: "SPACE",
        facilityId,
        unitId: room.unitId!,
        spaceId: room.id,
      },
      parentId: `unit:${room.unitId}`,
      label: room.name,
      isActive: true,
      isPlaced: parent?.hierarchyRole !== "STAGED",
      displayOrder: room.sortOrder,
    });
  }

  const request = buildProjectionRequest({
    facilityId,
    lens: buildDepartmentLens(departmentId, input.departmentKey),
    purpose: "LOCATIONS",
    principal: {
      principalKind: "USER",
      role: "PARTNER",
      allowedUnitIds: "ALL",
      permissionKeys: [],
      accessClassKey: `partner-locations:${departmentId}`,
    },
  });

  const source: ProjectionSource = {
    request,
    facility: { id: facilityId, label: facilityId },
    locations,
    rooms: rooms.map((room) => ({
      locationId: `space:${room.id}`,
      context: {
        id: room.id,
        facilityId,
        isActive: true,
        unitId: room.unitId,
        parentHierarchyRole: parentRole(unitById.get(room.unitId!)?.hierarchyRole ?? null),
        assignedDepartmentIds: [departmentId],
      },
    })),
    departments: [
      {
        id: departmentId,
        key: input.departmentKey,
        label: input.departmentName,
        isActive: true,
        activeProfile: null,
        assignedRoomIds: rooms.map((room) => room.id).sort(),
        assignedUnitIds: [...responsibleUnits].sort(),
        archetypeBindings: [],
        roomExceptions: [],
      },
    ],
    policies: [],
    revision: {
      hierarchyRevision: "partner-locations",
      assignmentRevision: "partner-locations",
      profileRevision: "none",
      bindingRevision: "none",
      policyRevision: "none",
      experienceRegistryVersion: EXPERIENCE_REGISTRY_VERSION,
      accessClassRevision: "partner-locations",
    },
    resolvedAt: "1970-01-01T00:00:00.000Z",
  };

  const snapshot = resolveProjection(source);
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  return {
    departmentName: input.departmentName,
    roots: snapshot.locations.roots
      .map((node) => toPartnerNode(node, roomById))
      .filter((node): node is PartnerLocationNode => Boolean(node)),
  };
}

export async function loadPartnerLocationProjection(input: {
  client: Db;
  facilityId: string;
  departmentId: string;
}): Promise<PartnerLocationProjection> {
  const departmentId = input.departmentId.trim();
  if (!departmentId) {
    throw new Error("Partner Locations require one Department.");
  }
  const facilityId = input.facilityId.trim();
  if (!facilityId) {
    throw new Error("Partner Locations require a Facility.");
  }

  const department = await input.client.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true, key: true, name: true },
  });
  if (!department) {
    throw new Error("Partner Locations require a Department in this Facility.");
  }

  const [unitRows, spaceRows] = await Promise.all([
    input.client.unitDepartmentResponsibility.findMany({
      where: {
        departmentId,
        unit: { facilityId, isActive: true },
      },
      select: { unitId: true },
    }),
    input.client.unitSpaceResponsibility.findMany({
      where: {
        departmentId,
        space: { facilityId, isActive: true, unitId: { not: null } },
      },
      select: {
        spaceId: true,
        space: {
          select: {
            id: true,
            facilityId: true,
            name: true,
            roomNumber: true,
            spaceType: true,
            unitId: true,
            isActive: true,
            sortOrder: true,
          },
        },
      },
    }),
  ]);

  const seedUnitIds = [
    ...unitRows.map((row) => row.unitId),
    ...spaceRows.map((row) => row.space.unitId).filter((id): id is string => Boolean(id)),
  ];
  const units = await loadUnitsWithAncestors(input.client, facilityId, seedUnitIds);

  return projectPartnerLocations({
    facilityId,
    departmentId,
    departmentKey: department.key,
    departmentName: department.name,
    units,
    rooms: spaceRows.map((row) => ({
      id: row.space.id,
      facilityId: row.space.facilityId,
      name: row.space.name,
      roomNumber: row.space.roomNumber,
      spaceType: row.space.spaceType,
      unitId: row.space.unitId,
      isActive: row.space.isActive,
      sortOrder: row.space.sortOrder,
    })),
    responsibleUnitIds: unitRows.map((row) => row.unitId),
    responsibleRoomIds: spaceRows.map((row) => row.spaceId),
  });
}

async function loadUnitsWithAncestors(
  client: Db,
  facilityId: string,
  seedIds: readonly string[],
): Promise<PartnerLocationUnitRow[]> {
  const byId = new Map<string, PartnerLocationUnitRow>();
  let pending = [...new Set(seedIds)];
  while (pending.length > 0) {
    const rows = await client.unit.findMany({
      where: { facilityId, id: { in: pending }, isActive: true },
      select: {
        id: true,
        facilityId: true,
        name: true,
        parentUnitId: true,
        hierarchyRole: true,
        displayOrder: true,
        isActive: true,
      },
    });
    pending = [];
    for (const row of rows) {
      if (byId.has(row.id)) continue;
      byId.set(row.id, row);
      if (row.parentUnitId && !byId.has(row.parentUnitId)) pending.push(row.parentUnitId);
    }
  }
  return [...byId.values()];
}
