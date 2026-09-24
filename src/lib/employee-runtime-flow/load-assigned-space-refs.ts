/**
 * Resolve assigned SPACE refs for Employee Runtime Flow.
 * SPACES: OA location rows. UNIT: Projection children, else facility UnitSpace children.
 * Does not infer rooms from Operational Type or UnitType.
 */

import type { AppJwtPayload } from "@/lib/auth";
import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";
import { formatRoomDisplayName } from "@/lib/facility-builder/load-facility-hierarchy";
import { collectNeighborhoodActionableSpaces } from "@/lib/unit-workspace/neighborhood/collect-spaces";
import { loadLocationsView } from "@/lib/locations";
import { prisma } from "@/lib/prisma";
import type { ResolvedAssignmentLocation } from "@/lib/scheduling/operational-assignments/location-scope";
import type { RuntimeLocationSpaceRef } from "@/lib/runtime-location-state";
import type { PrismaClient } from "@prisma/client";

import { assignmentScopeKind, spaceRefsFromAssignmentLocations } from "./assigned-spaces";

export async function loadAssignedEmployeeSpaceRefs(input: {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  departmentLabel?: string | null;
  assignment: JobFlowAssignmentSnapshot | null;
  locations: readonly ResolvedAssignmentLocation[];
  client?: PrismaClient;
}): Promise<RuntimeLocationSpaceRef[]> {
  const assignment = input.assignment;
  if (!assignment) return [];

  const scope = assignmentScopeKind(assignment, input.locations.length);
  if (scope === "SPACES") {
    return spaceRefsFromAssignmentLocations(
      input.locations,
      input.departmentId,
      input.departmentLabel,
    );
  }

  if (!assignment.unitId) return [];

  const locations = await loadLocationsView(input.session);
  if (locations.view) {
    const collected = collectNeighborhoodActionableSpaces(locations.view, assignment.unitId);
    const forDepartment = collected.refs.filter(
      (row) => row.departmentId === input.departmentId || row.unitId === assignment.unitId,
    );
    if (forDepartment.length > 0) {
      return forDepartment.map((row) => ({
        ...row,
        departmentId: input.departmentId,
        departmentLabel: input.departmentLabel ?? row.departmentLabel,
      }));
    }
  }

  const client = input.client ?? prisma;
  const rooms = await client.unitSpace.findMany({
    where: {
      unitId: assignment.unitId,
      isActive: true,
      unit: { facilityId: input.facilityId, isActive: true },
    },
    select: {
      id: true,
      name: true,
      roomNumber: true,
      unitId: true,
      unit: { select: { name: true } },
    },
    orderBy: [{ roomNumber: "asc" }, { name: "asc" }],
  });

  return rooms.map((room) => ({
    spaceId: room.id,
    departmentId: input.departmentId,
    departmentLabel: input.departmentLabel ?? null,
    unitId: room.unitId,
    displayName: formatRoomDisplayName(room),
    floorName: null,
    neighborhoodName: room.unit?.name ?? assignment.unitName ?? null,
  }));
}
