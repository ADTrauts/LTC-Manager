import { prisma } from "@/lib/prisma";

import type { EmployeeAssignmentRow, ResolvedCurrentAssignment } from "./resolve-current-assignment";
import { resolveCurrentEmployeeAssignment } from "./resolve-current-assignment";

/**
 * Load today's assignments for a single employee and resolve current/upcoming.
 * Used by Unit Workspace for the frontline "My Assignment" panel.
 */
export async function loadEmployeeAssignmentsToday(
  employeeId: string,
  facilityId: string,
  now: Date,
): Promise<ResolvedCurrentAssignment> {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const rows = await prisma.operationalAssignment.findMany({
    where: {
      employeeId,
      facilityId,
      serviceDate: todayStart,
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
    },
    orderBy: { startsAt: "asc" },
  });

  const assignments: EmployeeAssignmentRow[] = rows.map((r) => ({
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
