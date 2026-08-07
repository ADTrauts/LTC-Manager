import { prisma } from "@/lib/prisma";
import { getFacilityServiceDate, loadFacilityTimezone } from "@/lib/operational-time";
import { formatRoomDisplayName } from "@/lib/facility-builder/load-facility-hierarchy";

import { isPlanFrontlineVisible } from "./assignment-plan";
import type { EmployeeAssignmentRow, ResolvedCurrentAssignment } from "./resolve-current-assignment";
import { resolveCurrentEmployeeAssignment } from "./resolve-current-assignment";

/**
 * Load today's frontline-visible assignments for a single employee.
 * Draft plans are not exposed to employees.
 */
export async function loadEmployeeAssignmentsToday(
  employeeId: string,
  facilityId: string,
  now: Date,
): Promise<ResolvedCurrentAssignment> {
  const timezone = await loadFacilityTimezone(prisma, facilityId);
  const serviceDate = getFacilityServiceDate(timezone, now);

  const rows = await prisma.operationalAssignment.findMany({
    where: {
      employeeId,
      facilityId,
      serviceDate,
      status: { in: ["PLANNED", "ACTIVE"] },
    },
    select: {
      id: true,
      roleKey: true,
      roleLabel: true,
      unitId: true,
      unit: { select: { name: true } },
      operationInstanceId: true,
      operationInstance: { select: { label: true } },
      startsAt: true,
      endsAt: true,
      status: true,
      source: true,
      notes: true,
      plan: { select: { status: true } },
      updatedAt: true,
    },
    orderBy: { startsAt: "asc" },
  });

  const visible = rows.filter((r) => isPlanFrontlineVisible(r.plan?.status ?? null));

  const assignments: EmployeeAssignmentRow[] = visible.map((r) => ({
    id: r.id,
    roleKey: r.roleKey,
    roleLabel: r.roleLabel,
    unitName: r.unit?.name ?? null,
    operationLabel: r.operationInstance?.label ?? null,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    status: r.status,
    source: r.source,
    notes: r.notes,
  }));

  return resolveCurrentEmployeeAssignment(assignments, now);
}

export type EmployeeAssignmentOfflineContext = {
  assignmentId: string;
  unitId: string | null;
  unitName: string | null;
  duty: string;
  startsAt: string | null;
  endsAt: string | null;
  confirmedAt: string | null;
  lastSyncedAt: string;
  scopeKind: "UNIT" | "SPACES";
  locationCount: number;
  assignedLocations: Array<{ unitSpaceId: string; label: string }>;
  sourceZoneName: string | null;
  assignmentRevision: string;
};

/** Read-only Assignment snapshot for offline Runtime bundles (current employee only). */
export async function loadEmployeeAssignmentOfflineContext(
  employeeId: string,
  facilityId: string,
  now: Date = new Date(),
): Promise<EmployeeAssignmentOfflineContext | null> {
  const resolved = await loadEmployeeAssignmentsToday(employeeId, facilityId, now);
  const current = resolved.current;
  if (!current) return null;

  const row = await prisma.operationalAssignment.findFirst({
    where: { id: current.id, facilityId },
    select: {
      id: true,
      unitId: true,
      unit: { select: { name: true } },
      roleLabel: true,
      startsAt: true,
      endsAt: true,
      plan: { select: { confirmedAt: true } },
      updatedAt: true,
      sourceZone: { select: { name: true } },
      locations: {
        select: {
          unitSpaceId: true,
          labelSnapshot: true,
          sortOrder: true,
          unitSpace: { select: { name: true, roomNumber: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!row) return null;

  const assignedLocations = row.locations.map((l) => ({
    unitSpaceId: l.unitSpaceId,
    label: l.labelSnapshot?.trim() || formatRoomDisplayName(l.unitSpace),
  }));
  const scopeKind = assignedLocations.length > 0 ? "SPACES" : "UNIT";
  const startsIso = row.startsAt?.toISOString() ?? null;

  return {
    assignmentId: row.id,
    unitId: row.unitId,
    unitName: row.unit?.name ?? null,
    duty: row.roleLabel,
    startsAt: startsIso,
    endsAt: row.endsAt?.toISOString() ?? null,
    confirmedAt: row.plan?.confirmedAt?.toISOString() ?? null,
    lastSyncedAt: now.toISOString(),
    scopeKind,
    locationCount: assignedLocations.length,
    assignedLocations,
    sourceZoneName: row.sourceZone?.name ?? null,
    assignmentRevision: `${row.id}|${startsIso ?? ""}|${assignedLocations.length}|${row.updatedAt.toISOString()}`,
  };
}
