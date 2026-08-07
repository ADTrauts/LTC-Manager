/**
 * Phase 11C — Assignment location scope helpers.
 *
 * Empty location rows + unitId = unit-wide (Dietary / EVS whole Unit).
 * Non-empty location rows = explicit Room / Space responsibility snapshot.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import { formatRoomDisplayName } from "@/lib/facility-builder/load-facility-hierarchy";
import { responsibilityWindowsOverlap } from "@/lib/scheduling/operational-assignments/responsibility-window";

export type AssignmentScopeKind = "UNIT" | "SPACES";

export type AssignmentLocationInput = {
  unitSpaceId: string;
  unitId?: string | null;
  labelSnapshot?: string | null;
  sortOrder?: number;
};

export type ResolvedAssignmentLocation = {
  unitSpaceId: string;
  unitId: string | null;
  label: string;
  sortOrder: number;
  roomNumber: string | null;
  spaceName: string;
  unitName: string | null;
};

export type DbClient = PrismaClient | Prisma.TransactionClient;

export function deriveAssignmentScopeKind(locationCount: number): AssignmentScopeKind {
  return locationCount > 0 ? "SPACES" : "UNIT";
}

export function formatAssignmentLocationLabel(space: {
  name: string;
  roomNumber?: string | null;
}): string {
  return formatRoomDisplayName(space);
}

/**
 * Validate UnitSpaces for Assignment write. Rejects cross-facility / inactive /
 * wrong-unit spaces. Returns ordered location rows ready for createMany.
 */
export async function resolveAssignmentLocationWrites(
  client: DbClient,
  input: {
    facilityId: string;
    unitId?: string | null;
    unitSpaceIds: string[];
  },
): Promise<AssignmentLocationInput[]> {
  const uniqueIds = [...new Set(input.unitSpaceIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const spaces = await client.unitSpace.findMany({
    where: { id: { in: uniqueIds }, facilityId: input.facilityId },
    select: {
      id: true,
      name: true,
      roomNumber: true,
      unitId: true,
      isActive: true,
      sortOrder: true,
      unit: { select: { id: true, name: true, isActive: true } },
    },
  });

  if (spaces.length !== uniqueIds.length) {
    throw new Error("One or more Rooms / Spaces were not found in this Facility.");
  }

  const byId = new Map(spaces.map((s) => [s.id, s]));
  const ordered: AssignmentLocationInput[] = [];

  for (const id of uniqueIds) {
    const space = byId.get(id)!;
    if (!space.isActive) {
      throw new Error(`Room / Space "${formatAssignmentLocationLabel(space)}" is inactive.`);
    }
    if (input.unitId && space.unitId && space.unitId !== input.unitId) {
      throw new Error(
        `Room / Space "${formatAssignmentLocationLabel(space)}" is not under the selected Unit.`,
      );
    }
    ordered.push({
      unitSpaceId: space.id,
      unitId: space.unitId,
      labelSnapshot: formatAssignmentLocationLabel(space),
      sortOrder: space.sortOrder,
    });
  }

  return ordered.sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100));
}

export async function replaceAssignmentLocations(
  client: DbClient,
  assignmentId: string,
  locations: AssignmentLocationInput[],
): Promise<void> {
  await client.operationalAssignmentLocation.deleteMany({ where: { assignmentId } });
  if (locations.length === 0) return;
  await client.operationalAssignmentLocation.createMany({
    data: locations.map((loc, index) => ({
      assignmentId,
      unitSpaceId: loc.unitSpaceId,
      unitId: loc.unitId ?? null,
      labelSnapshot: loc.labelSnapshot ?? null,
      sortOrder: loc.sortOrder ?? index + 1,
    })),
  });
}

export async function loadAssignmentLocations(
  client: DbClient,
  assignmentIds: string[],
): Promise<Map<string, ResolvedAssignmentLocation[]>> {
  const map = new Map<string, ResolvedAssignmentLocation[]>();
  if (assignmentIds.length === 0) return map;

  const rows = await client.operationalAssignmentLocation.findMany({
    where: { assignmentId: { in: assignmentIds } },
    select: {
      assignmentId: true,
      unitSpaceId: true,
      unitId: true,
      labelSnapshot: true,
      sortOrder: true,
      unitSpace: {
        select: {
          name: true,
          roomNumber: true,
          unit: { select: { name: true } },
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  for (const row of rows) {
    const list = map.get(row.assignmentId) ?? [];
    const label =
      row.labelSnapshot?.trim() ||
      formatAssignmentLocationLabel(row.unitSpace);
    list.push({
      unitSpaceId: row.unitSpaceId,
      unitId: row.unitId,
      label,
      sortOrder: row.sortOrder,
      roomNumber: row.unitSpace.roomNumber,
      spaceName: row.unitSpace.name,
      unitName: row.unitSpace.unit?.name ?? null,
    });
    map.set(row.assignmentId, list);
  }
  return map;
}

/**
 * Resolve the set of UnitSpace ids covered by an Assignment.
 * Unit-wide → all active spaces under unitId (or empty if no unit).
 * Space-scoped → explicit location rows.
 */
export async function resolveCoveredUnitSpaceIds(
  client: DbClient,
  input: {
    facilityId: string;
    unitId: string | null;
    locations: Array<{ unitSpaceId: string }>;
  },
): Promise<string[]> {
  if (input.locations.length > 0) {
    return input.locations.map((l) => l.unitSpaceId);
  }
  if (!input.unitId) return [];
  const spaces = await client.unitSpace.findMany({
    where: {
      facilityId: input.facilityId,
      unitId: input.unitId,
      isActive: true,
    },
    select: { id: true },
    orderBy: [{ sortOrder: "asc" }, { roomNumber: "asc" }, { name: "asc" }],
  });
  return spaces.map((s) => s.id);
}

export type LocationOverlapHit = {
  otherAssignmentId: string;
  otherEmployeeId: string;
  unitSpaceId: string;
  label: string;
};

/**
 * Detect overlapping Room/Space responsibility for PLANNED/ACTIVE Assignments.
 * Unit-wide Assignments cover all spaces under their unitId.
 */
export async function detectLocationResponsibilityOverlaps(
  client: DbClient,
  input: {
    facilityId: string;
    departmentId: string;
    serviceDate: Date;
    employeeId: string;
    unitId?: string | null;
    unitSpaceIds: string[];
    startsAt: Date | null;
    endsAt: Date | null;
    excludeAssignmentId?: string | null;
  },
): Promise<LocationOverlapHit[]> {
  const candidateSpaceIds = new Set(input.unitSpaceIds);
  if (candidateSpaceIds.size === 0 && input.unitId) {
    const unitSpaces = await client.unitSpace.findMany({
      where: { facilityId: input.facilityId, unitId: input.unitId, isActive: true },
      select: { id: true },
    });
    for (const s of unitSpaces) candidateSpaceIds.add(s.id);
  }
  if (candidateSpaceIds.size === 0) return [];

  const others = await client.operationalAssignment.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate: input.serviceDate,
      status: { in: ["PLANNED", "ACTIVE"] },
      ...(input.excludeAssignmentId ? { id: { not: input.excludeAssignmentId } } : {}),
    },
    select: {
      id: true,
      employeeId: true,
      unitId: true,
      startsAt: true,
      endsAt: true,
      locations: {
        select: {
          unitSpaceId: true,
          labelSnapshot: true,
          unitSpace: { select: { name: true, roomNumber: true } },
        },
      },
    },
  });

  const hits: LocationOverlapHit[] = [];

  for (const other of others) {
    if (!responsibilityWindowsOverlap(input.startsAt, input.endsAt, other.startsAt, other.endsAt)) {
      continue;
    }

    let otherSpaceIds: string[];
    const labelBySpace = new Map<string, string>();
    if (other.locations.length > 0) {
      otherSpaceIds = other.locations.map((l) => {
        const label =
          l.labelSnapshot?.trim() ||
          formatAssignmentLocationLabel(l.unitSpace);
        labelBySpace.set(l.unitSpaceId, label);
        return l.unitSpaceId;
      });
    } else if (other.unitId) {
      const spaces = await client.unitSpace.findMany({
        where: { facilityId: input.facilityId, unitId: other.unitId, isActive: true },
        select: { id: true, name: true, roomNumber: true },
      });
      otherSpaceIds = spaces.map((s) => {
        labelBySpace.set(s.id, formatAssignmentLocationLabel(s));
        return s.id;
      });
    } else {
      continue;
    }

    for (const spaceId of otherSpaceIds) {
      if (!candidateSpaceIds.has(spaceId)) continue;
      // Same employee sequential scopes are allowed only when windows do not overlap
      // (already gated). Same employee overlapping same space is still a conflict.
      hits.push({
        otherAssignmentId: other.id,
        otherEmployeeId: other.employeeId,
        unitSpaceId: spaceId,
        label: labelBySpace.get(spaceId) ?? spaceId,
      });
    }
  }

  return hits;
}

export async function assertNoLocationResponsibilityOverlaps(
  client: DbClient,
  input: Parameters<typeof detectLocationResponsibilityOverlaps>[1],
): Promise<void> {
  const hits = await detectLocationResponsibilityOverlaps(client, input);
  if (hits.length === 0) return;
  const sample = hits
    .slice(0, 3)
    .map((h) => h.label)
    .join(", ");
  throw new Error(
    `Overlapping Room / Space responsibility detected (${hits.length}): ${sample}. Adjust windows or selection.`,
  );
}
