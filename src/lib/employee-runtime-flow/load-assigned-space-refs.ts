/** Assigned rooms are explicit Assignment scope intersected with current Department responsibility. */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { FacilitySession } from "@/lib/auth";
import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";
import { formatRoomDisplayName } from "@/lib/facility-builder/load-facility-hierarchy";
import { prisma } from "@/lib/prisma";
import type { ResolvedAssignmentLocation } from "@/lib/scheduling/operational-assignments/location-scope";
import type { RuntimeLocationSpaceRef } from "@/lib/runtime-location-state";
import { assignmentScopeKind } from "./assigned-spaces";

export async function loadAssignedEmployeeSpaceRefs(input: {
  session: FacilitySession;
  facilityId: string;
  departmentId: string;
  departmentLabel?: string | null;
  assignment: JobFlowAssignmentSnapshot | null;
  locations: readonly ResolvedAssignmentLocation[];
  client?: PrismaClient | Prisma.TransactionClient;
}): Promise<RuntimeLocationSpaceRef[]> {
  const assignment = input.assignment;
  if (!assignment || input.session.facilityId !== input.facilityId) return [];
  const explicit = assignmentScopeKind(assignment, input.locations.length) === "SPACES";
  if (explicit ? !input.locations.length : !assignment.unitId) return [];
  const client = input.client ?? prisma;
  const rooms = await client.unitSpace.findMany({
    where: { facilityId: input.facilityId, isActive: true,
      ...(explicit ? { id: { in: input.locations.map(row => row.unitSpaceId) } } : { unitId: assignment.unitId }),
      responsibilities: { some: { departmentId: input.departmentId, department: { facilityId: input.facilityId, isActive: true } } },
      OR: [{ unitId: null }, { unit: { facilityId: input.facilityId, isActive: true } }],
    },
    select: { id: true, name: true, roomNumber: true, unitId: true,
      unit: { select: { name: true, parentUnit: { select: { name: true } } } } },
    orderBy: [{ sortOrder: "asc" }, { roomNumber: "asc" }, { name: "asc" }],
  });
  const order = new Map(input.locations.map((row, index) => [row.unitSpaceId, index]));
  if (explicit) rooms.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return rooms.map(room => ({ spaceId: room.id, departmentId: input.departmentId,
    departmentLabel: input.departmentLabel ?? null, unitId: room.unitId, displayName: formatRoomDisplayName(room),
    floorName: room.unit?.parentUnit?.name ?? null, neighborhoodName: room.unit?.name ?? null }));
}
