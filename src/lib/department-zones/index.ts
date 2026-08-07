/**
 * Phase 11C — Department operational Zones.
 *
 * Zones group existing UnitSpaces for Assignment convenience and Supervisor filters.
 * They are not physical locations, Assignments, Work Plans, or authorization.
 */

import type { DepartmentOperationalZoneStatus, Prisma, PrismaClient } from "@prisma/client";

import { formatRoomDisplayName } from "@/lib/facility-builder/load-facility-hierarchy";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export type ZoneLocationView = {
  unitSpaceId: string;
  unitId: string | null;
  unitName: string | null;
  label: string;
  roomNumber: string | null;
  sortOrder: number;
};

export type ZoneView = {
  id: string;
  facilityId: string;
  departmentId: string;
  name: string;
  description: string | null;
  status: DepartmentOperationalZoneStatus;
  retiredAt: string | null;
  locationCount: number;
  locations: ZoneLocationView[];
  lastChangedAt: string | null;
};

export async function loadZonesForDepartment(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    includeRetired?: boolean;
  },
): Promise<ZoneView[]> {
  const rows = await client.departmentOperationalZone.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      ...(input.includeRetired ? {} : { status: { not: "RETIRED" } }),
    },
    include: {
      locations: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          unitSpace: {
            select: {
              id: true,
              name: true,
              roomNumber: true,
              unitId: true,
              unit: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return rows.map(mapZoneRow);
}

export async function loadZoneById(
  client: DbClient,
  input: { facilityId: string; zoneId: string },
): Promise<ZoneView | null> {
  const row = await client.departmentOperationalZone.findFirst({
    where: { id: input.zoneId, facilityId: input.facilityId },
    include: {
      locations: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          unitSpace: {
            select: {
              id: true,
              name: true,
              roomNumber: true,
              unitId: true,
              unit: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  return row ? mapZoneRow(row) : null;
}

function mapZoneRow(z: {
  id: string;
  facilityId: string;
  departmentId: string;
  name: string;
  description: string | null;
  status: DepartmentOperationalZoneStatus;
  retiredAt: Date | null;
  lastChangedAt: Date | null;
  locations: Array<{
    unitSpaceId: string;
    unitId: string | null;
    sortOrder: number;
    unitSpace: {
      id: string;
      name: string;
      roomNumber: string | null;
      unitId: string | null;
      unit: { name: string } | null;
    };
  }>;
}): ZoneView {
  return {
    id: z.id,
    facilityId: z.facilityId,
    departmentId: z.departmentId,
    name: z.name,
    description: z.description,
    status: z.status,
    retiredAt: z.retiredAt?.toISOString() ?? null,
    locationCount: z.locations.length,
    locations: z.locations.map((loc) => ({
      unitSpaceId: loc.unitSpaceId,
      unitId: loc.unitId ?? loc.unitSpace.unitId,
      unitName: loc.unitSpace.unit?.name ?? null,
      label: formatRoomDisplayName(loc.unitSpace),
      roomNumber: loc.unitSpace.roomNumber,
      sortOrder: loc.sortOrder,
    })),
    lastChangedAt: z.lastChangedAt?.toISOString() ?? null,
  };
}

export async function createDepartmentZone(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    name: string;
    description?: string | null;
    unitSpaceIds: string[];
    actorUserId: string | null;
    activate?: boolean;
  },
): Promise<ZoneView> {
  const name = input.name.trim();
  if (!name) throw new Error("Zone name is required.");

  const locations = await resolveZoneLocationWrites(client, {
    facilityId: input.facilityId,
    unitSpaceIds: input.unitSpaceIds,
  });

  const created = await client.departmentOperationalZone.create({
    data: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      name,
      description: input.description?.trim() || null,
      status: input.activate ? "ACTIVE" : "DRAFT",
      createdByUserId: input.actorUserId,
      lastChangedByUserId: input.actorUserId,
      lastChangedAt: new Date(),
      locations: {
        create: locations.map((loc, index) => ({
          unitSpaceId: loc.unitSpaceId,
          unitId: loc.unitId,
          sortOrder: loc.sortOrder ?? index + 1,
        })),
      },
    },
    select: { id: true },
  });

  const found = await loadZoneById(client, {
    facilityId: input.facilityId,
    zoneId: created.id,
  });
  if (!found) throw new Error("Zone created but could not be reloaded.");
  return found;
}

export async function updateDepartmentZone(
  client: DbClient,
  input: {
    facilityId: string;
    zoneId: string;
    name?: string;
    description?: string | null;
    unitSpaceIds?: string[];
    status?: Exclude<DepartmentOperationalZoneStatus, "RETIRED">;
    actorUserId: string | null;
  },
): Promise<ZoneView> {
  const existing = await client.departmentOperationalZone.findFirst({
    where: { id: input.zoneId, facilityId: input.facilityId },
    select: { id: true, departmentId: true, status: true },
  });
  if (!existing) throw new Error("Zone not found.");
  if (existing.status === "RETIRED") {
    throw new Error("Retired Zones cannot be edited. Create a new Zone instead.");
  }

  const data: Prisma.DepartmentOperationalZoneUpdateInput = {
    lastChangedByUser: input.actorUserId
      ? { connect: { id: input.actorUserId } }
      : { disconnect: true },
    lastChangedAt: new Date(),
  };
  if (input.name != null) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.status) data.status = input.status;

  await client.departmentOperationalZone.update({
    where: { id: existing.id },
    data,
  });

  if (input.unitSpaceIds) {
    const locations = await resolveZoneLocationWrites(client, {
      facilityId: input.facilityId,
      unitSpaceIds: input.unitSpaceIds,
    });
    await client.departmentOperationalZoneLocation.deleteMany({ where: { zoneId: existing.id } });
    if (locations.length > 0) {
      await client.departmentOperationalZoneLocation.createMany({
        data: locations.map((loc, index) => ({
          zoneId: existing.id,
          unitSpaceId: loc.unitSpaceId,
          unitId: loc.unitId,
          sortOrder: loc.sortOrder ?? index + 1,
        })),
      });
    }
  }

  const found = await loadZoneById(client, {
    facilityId: input.facilityId,
    zoneId: existing.id,
  });
  if (!found) throw new Error("Zone updated but could not be reloaded.");
  return found;
}

export async function retireDepartmentZone(
  client: DbClient,
  input: {
    facilityId: string;
    zoneId: string;
    actorUserId: string | null;
  },
): Promise<void> {
  const existing = await client.departmentOperationalZone.findFirst({
    where: { id: input.zoneId, facilityId: input.facilityId },
    select: { id: true, status: true },
  });
  if (!existing) throw new Error("Zone not found.");
  if (existing.status === "RETIRED") return;

  await client.departmentOperationalZone.update({
    where: { id: existing.id },
    data: {
      status: "RETIRED",
      retiredAt: new Date(),
      lastChangedByUser: input.actorUserId
        ? { connect: { id: input.actorUserId } }
        : { disconnect: true },
      lastChangedAt: new Date(),
    },
  });
}

export async function loadZoneSpaceIds(
  client: DbClient,
  input: { facilityId: string; zoneId: string },
): Promise<string[]> {
  const zone = await client.departmentOperationalZone.findFirst({
    where: { id: input.zoneId, facilityId: input.facilityId, status: { not: "RETIRED" } },
    select: {
      locations: {
        select: { unitSpaceId: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!zone) throw new Error("Zone not found or retired.");
  return zone.locations.map((l) => l.unitSpaceId);
}

async function resolveZoneLocationWrites(
  client: DbClient,
  input: { facilityId: string; unitSpaceIds: string[] },
): Promise<Array<{ unitSpaceId: string; unitId: string | null; sortOrder: number }>> {
  const uniqueIds = [...new Set(input.unitSpaceIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const spaces = await client.unitSpace.findMany({
    where: { id: { in: uniqueIds }, facilityId: input.facilityId, isActive: true },
    select: { id: true, unitId: true, sortOrder: true, name: true, roomNumber: true },
  });
  if (spaces.length !== uniqueIds.length) {
    throw new Error("One or more Zone Rooms / Spaces were not found in this Facility.");
  }
  const byId = new Map(spaces.map((s) => [s.id, s]));
  return uniqueIds.map((id, index) => {
    const space = byId.get(id)!;
    return {
      unitSpaceId: space.id,
      unitId: space.unitId,
      sortOrder: space.sortOrder ?? index + 1,
    };
  });
}
