/**
 * Shared frontline OA loader for Employee Runtime Flow.
 * Same visibility and current/upcoming picker as Job Flow today.
 */

import { formatRoomDisplayName } from "@/lib/facility-builder/load-facility-hierarchy";
import { prisma } from "@/lib/prisma";
import { isPlanFrontlineVisible } from "@/lib/scheduling/operational-assignments/assignment-plan";
import type { ResolvedAssignmentLocation } from "@/lib/scheduling/operational-assignments/location-scope";
import { resolveCurrentEmployeeAssignment } from "@/lib/scheduling/operational-assignments/resolve-current-assignment";
import type { JobFlowAssignmentSnapshot } from "@/lib/dietary-job-flow/types";
import type { PrismaClient } from "@prisma/client";

export type LoadedFrontlineAssignments = {
  current: JobFlowAssignmentSnapshot | null;
  upcoming: JobFlowAssignmentSnapshot | null;
  previous: JobFlowAssignmentSnapshot | null;
  day: JobFlowAssignmentSnapshot[];
  locationsByAssignmentId: Map<string, ResolvedAssignmentLocation[]>;
};

export async function loadFrontlineEmployeeAssignments(input: {
  employeeId: string;
  facilityId: string;
  departmentId: string;
  serviceDate: Date;
  now: Date;
  client?: PrismaClient;
}): Promise<LoadedFrontlineAssignments> {
  const client = input.client ?? prisma;
  const rows = await client.operationalAssignment.findMany({
    where: {
      employeeId: input.employeeId,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate: input.serviceDate,
      status: { in: ["PLANNED", "ACTIVE", "COMPLETED"] },
    },
    select: {
      id: true,
      roleKey: true,
      roleLabel: true,
      unitId: true,
      unit: { select: { name: true } },
      startsAt: true,
      endsAt: true,
      status: true,
      plan: { select: { status: true } },
      sourceZone: { select: { name: true } },
      locations: {
        select: {
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
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const visible = rows.filter((row) => isPlanFrontlineVisible(row.plan?.status ?? null));
  const locationsByAssignmentId = new Map<string, ResolvedAssignmentLocation[]>();
  const snapshots: JobFlowAssignmentSnapshot[] = visible.map((row) => {
    const locations: ResolvedAssignmentLocation[] = row.locations.map((location) => ({
      unitSpaceId: location.unitSpaceId,
      unitId: location.unitId,
      label: location.labelSnapshot?.trim() || formatRoomDisplayName(location.unitSpace),
      sortOrder: location.sortOrder,
      roomNumber: location.unitSpace.roomNumber,
      spaceName: location.unitSpace.name,
      unitName: location.unitSpace.unit?.name ?? null,
    }));
    locationsByAssignmentId.set(row.id, locations);
    return {
      id: row.id,
      roleKey: row.roleKey,
      roleLabel: row.roleLabel,
      unitId: row.unitId,
      unitName: row.unit?.name ?? null,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
      scopeKind: locations.length > 0 ? "SPACES" : "UNIT",
      locationCount: locations.length,
      locationLabels: locations.map((location) => location.label),
      sourceZoneName: row.sourceZone?.name ?? null,
    };
  });

  const activeOrPlanned = snapshots.filter(
    (row) => row.status === "ACTIVE" || row.status === "PLANNED",
  );
  const resolved = resolveCurrentEmployeeAssignment(
    activeOrPlanned.map((row) => ({
      id: row.id,
      roleKey: row.roleKey,
      roleLabel: row.roleLabel,
      unitName: row.unitName,
      operationLabel: null,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status as "PLANNED" | "ACTIVE",
      source: "MANUAL",
      notes: null,
    })),
    input.now,
  );

  const byId = new Map(snapshots.map((row) => [row.id, row]));
  const current = resolved.current ? (byId.get(resolved.current.id) ?? null) : null;
  const upcoming = resolved.upcoming ? (byId.get(resolved.upcoming.id) ?? null) : null;
  const previous =
    snapshots
      .filter(
        (row) =>
          row.id !== current?.id &&
          row.id !== upcoming?.id &&
          row.endsAt != null &&
          row.endsAt.getTime() <= input.now.getTime(),
      )
      .sort((a, b) => (b.endsAt?.getTime() ?? 0) - (a.endsAt?.getTime() ?? 0))[0] ?? null;

  return { current, upcoming, previous, day: snapshots, locationsByAssignmentId };
}
