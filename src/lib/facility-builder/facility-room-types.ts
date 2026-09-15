/**
 * Facility Room Type catalog — facility-owned vocabulary over system Base Types.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  baseTypeKeyFromLegacyRoomIdentity,
  isFacilityBaseTypeKey,
  legacyFieldsForFacilityRoomType,
  requireFacilityBaseType,
} from "./facility-base-types";
import { roomTypeIdentity } from "./space-type-presets";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type FacilityRoomTypeRow = {
  id: string;
  facilityId: string;
  baseTypeKey: string;
  baseTypeLabel: string;
  displayName: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  archivedAt: Date | null;
  roomCount: number;
};

function normalizeDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Room Type name is required.");
  if (trimmed.length > 80) throw new Error("Room Type name must be 80 characters or fewer.");
  return trimmed;
}

export async function listFacilityRoomTypes(
  facilityId: string,
  client: DbClient,
  opts?: { includeArchived?: boolean },
): Promise<FacilityRoomTypeRow[]> {
  const rows = await client.facilityRoomType.findMany({
    where: {
      facilityId,
      ...(opts?.includeArchived ? {} : { isActive: true, archivedAt: null }),
    },
    include: {
      _count: { select: { spaces: { where: { isActive: true } } } },
    },
    orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    facilityId: row.facilityId,
    baseTypeKey: row.baseTypeKey,
    baseTypeLabel: requireFacilityBaseType(row.baseTypeKey).label,
    displayName: row.displayName,
    description: row.description,
    displayOrder: row.displayOrder,
    isActive: row.isActive,
    archivedAt: row.archivedAt,
    roomCount: row._count.spaces,
  }));
}

export async function createFacilityRoomType(
  input: {
    facilityId: string;
    displayName: string;
    baseTypeKey: string;
    description?: string | null;
    displayOrder?: number;
  },
  client: DbClient,
): Promise<FacilityRoomTypeRow> {
  if (!isFacilityBaseTypeKey(input.baseTypeKey)) {
    throw new Error("Invalid base type.");
  }
  const displayName = normalizeDisplayName(input.displayName);
  const description = input.description?.trim() || null;

  try {
    const created = await client.facilityRoomType.create({
      data: {
        facilityId: input.facilityId,
        baseTypeKey: input.baseTypeKey,
        displayName,
        description,
        displayOrder: input.displayOrder ?? 100,
      },
      include: { _count: { select: { spaces: true } } },
    });
    return {
      id: created.id,
      facilityId: created.facilityId,
      baseTypeKey: created.baseTypeKey,
      baseTypeLabel: requireFacilityBaseType(created.baseTypeKey).label,
      displayName: created.displayName,
      description: created.description,
      displayOrder: created.displayOrder,
      isActive: created.isActive,
      archivedAt: created.archivedAt,
      roomCount: created._count.spaces,
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new Error("A Room Type with this name already exists.");
    }
    throw error;
  }
}

export async function updateFacilityRoomType(
  input: {
    facilityId: string;
    id: string;
    displayName?: string;
    baseTypeKey?: string;
    description?: string | null;
    displayOrder?: number;
  },
  client: DbClient,
): Promise<FacilityRoomTypeRow> {
  const existing = await client.facilityRoomType.findFirst({
    where: { id: input.id, facilityId: input.facilityId },
  });
  if (!existing) throw new Error("Room Type not found.");

  const displayName =
    input.displayName !== undefined
      ? normalizeDisplayName(input.displayName)
      : existing.displayName;
  const baseTypeKey = input.baseTypeKey ?? existing.baseTypeKey;
  if (!isFacilityBaseTypeKey(baseTypeKey)) {
    throw new Error("Invalid base type.");
  }
  const description =
    input.description === undefined
      ? existing.description
      : input.description?.trim() || null;

  try {
    const updated = await client.facilityRoomType.update({
      where: { id: existing.id },
      data: {
        displayName,
        baseTypeKey,
        description,
        displayOrder: input.displayOrder ?? existing.displayOrder,
      },
      include: {
        _count: { select: { spaces: { where: { isActive: true } } } },
      },
    });

    // Dual-write legacy labels on assigned rooms so Build displays stay coherent
    // without rewriting spaceType enum when only the display name changed.
    if (displayName !== existing.displayName || baseTypeKey !== existing.baseTypeKey) {
      const legacy = legacyFieldsForFacilityRoomType({
        baseTypeKey,
        displayName,
      });
      await client.unitSpace.updateMany({
        where: { facilityRoomTypeId: existing.id, facilityId: input.facilityId },
        data: {
          customTypeLabel: legacy.customTypeLabel,
          spaceType: legacy.spaceType,
        },
      });
    }

    return {
      id: updated.id,
      facilityId: updated.facilityId,
      baseTypeKey: updated.baseTypeKey,
      baseTypeLabel: requireFacilityBaseType(updated.baseTypeKey).label,
      displayName: updated.displayName,
      description: updated.description,
      displayOrder: updated.displayOrder,
      isActive: updated.isActive,
      archivedAt: updated.archivedAt,
      roomCount: updated._count.spaces,
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      throw new Error("A Room Type with this name already exists.");
    }
    throw error;
  }
}

export async function archiveOrDeleteFacilityRoomType(
  input: { facilityId: string; id: string },
  client: DbClient,
): Promise<{ action: "deleted" | "archived" | "blocked"; roomCount: number }> {
  const existing = await client.facilityRoomType.findFirst({
    where: { id: input.id, facilityId: input.facilityId },
    include: { _count: { select: { spaces: true } } },
  });
  if (!existing) throw new Error("Room Type not found.");

  const roomCount = existing._count.spaces;
  if (roomCount > 0) {
    await client.facilityRoomType.update({
      where: { id: existing.id },
      data: { isActive: false, archivedAt: new Date() },
    });
    return { action: "archived", roomCount };
  }

  await client.facilityRoomType.delete({ where: { id: existing.id } });
  return { action: "deleted", roomCount: 0 };
}

export type FacilityRoomTypeBackfillReport = {
  facilityId: string;
  typesCreated: number;
  roomsLinked: number;
  ambiguousLabels: string[];
};

/**
 * Group unlinked rooms by legacy identity and create/reuse Facility Room Types.
 * Preserves visible names. Does not invent Servery as a system base type.
 */
export async function backfillFacilityRoomTypesForFacility(
  facilityId: string,
  client: DbClient,
): Promise<FacilityRoomTypeBackfillReport> {
  const spaces = await client.unitSpace.findMany({
    where: { facilityId, facilityRoomTypeId: null },
    select: {
      id: true,
      spaceType: true,
      customTypeLabel: true,
    },
  });

  if (spaces.length === 0) {
    return { facilityId, typesCreated: 0, roomsLinked: 0, ambiguousLabels: [] };
  }

  const existingTypes = await client.facilityRoomType.findMany({
    where: { facilityId },
    select: { id: true, displayName: true, baseTypeKey: true },
  });
  const byName = new Map(
    existingTypes.map((row) => [row.displayName.trim().toLowerCase(), row]),
  );

  const ambiguousLabels: string[] = [];
  let typesCreated = 0;
  let roomsLinked = 0;
  let nextOrder =
    existingTypes.reduce((max, _row) => max, 0) ||
    0;
  // Prefer max displayOrder when available — reload with order for accuracy.
  const maxOrderRow = await client.facilityRoomType.findFirst({
    where: { facilityId },
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });
  nextOrder = (maxOrderRow?.displayOrder ?? 0) + 10;

  // Group by visible identity key
  const groups = new Map<
    string,
    {
      displayName: string;
      baseTypeKey: string;
      confident: boolean;
      spaceIds: string[];
    }
  >();

  for (const space of spaces) {
    const identity = roomTypeIdentity({
      spaceType: space.spaceType,
      customTypeLabel: space.customTypeLabel,
    });
    const mapped = baseTypeKeyFromLegacyRoomIdentity({
      presetKey: identity.isCustom ? "custom" : identity.presetKey,
      spaceType: space.spaceType,
      customTypeLabel: space.customTypeLabel,
    });
    const groupKey = `${identity.key}::${mapped.baseTypeKey}`;
    const prior = groups.get(groupKey);
    if (prior) {
      prior.spaceIds.push(space.id);
      continue;
    }
    groups.set(groupKey, {
      displayName: identity.label,
      baseTypeKey: mapped.baseTypeKey,
      confident: mapped.confident,
      spaceIds: [space.id],
    });
    if (!mapped.confident) {
      ambiguousLabels.push(identity.label);
    }
  }

  for (const group of groups.values()) {
    const nameKey = group.displayName.trim().toLowerCase();
    let typeId = byName.get(nameKey)?.id;
    if (!typeId) {
      const created = await client.facilityRoomType.create({
        data: {
          facilityId,
          baseTypeKey: group.baseTypeKey,
          displayName: group.displayName,
          displayOrder: nextOrder,
        },
      });
      nextOrder += 10;
      typesCreated += 1;
      typeId = created.id;
      byName.set(nameKey, {
        id: created.id,
        displayName: created.displayName,
        baseTypeKey: created.baseTypeKey,
      });
    }

    await client.unitSpace.updateMany({
      where: { id: { in: group.spaceIds }, facilityId },
      data: { facilityRoomTypeId: typeId },
    });
    roomsLinked += group.spaceIds.length;
  }

  return {
    facilityId,
    typesCreated,
    roomsLinked,
    ambiguousLabels: [...new Set(ambiguousLabels)].sort(),
  };
}

/** Ensure catalog exists for a facility (idempotent). */
export async function ensureFacilityRoomTypesBackfilled(
  facilityId: string,
  client: DbClient,
): Promise<FacilityRoomTypeBackfillReport> {
  return backfillFacilityRoomTypesForFacility(facilityId, client);
}
