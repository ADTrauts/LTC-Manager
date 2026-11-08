/**
 * Phase 2C-2B — batch loaders for canonical Job Flow contributors.
 *
 * Fail-closed Plant WO visibility: only Work Orders assigned to this employee
 * in the responsible Department. Location-open Plant queues are not projected
 * onto every assignee. PM pre-WO occurrences are not employee Job Flow items;
 * when a PM occurrence has generated a WO, the WO is the actionable owner.
 */

import { prisma } from "@/lib/prisma";
import {
  buildOperationalTimeContext,
  getFacilityLocalTodayWindow,
  loadFacilityTimezone,
} from "@/lib/operational-time";
import { presenceCallOffDepartmentWhere } from "@/lib/scheduling/load-presence-call-offs";

import type {
  JobFlowAssignmentExceptionSource,
  JobFlowWorkOrderSource,
} from "./job-flow-item";

const OPEN_WO_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_ON_VENDOR",
  "ON_HOLD",
] as const;

export async function loadAssignedWorkOrdersForJobFlow(input: {
  facilityId: string;
  departmentId: string;
  employeeId: string;
  /** Facility service-day start (UTC instant) for including today's completions. */
  serviceDayStartsAt: Date;
}): Promise<JobFlowWorkOrderSource[]> {
  const rows = await prisma.repair.findMany({
    where: {
      responsibleDepartmentId: input.departmentId,
      assignedEmployeeId: input.employeeId,
      unit: { facilityId: input.facilityId },
      OR: [
        { status: { in: [...OPEN_WO_STATUSES] } },
        {
          status: "COMPLETED",
          completedAt: { gte: input.serviceDayStartsAt },
        },
      ],
    },
    select: {
      id: true,
      repairCode: true,
      title: true,
      status: true,
      dueAt: true,
      unitId: true,
      spaceId: true,
      assetId: true,
      pmOccurrenceId: true,
      workOrderKind: true,
    },
    orderBy: [{ dueAt: "asc" }, { requestedAt: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    repairCode: row.repairCode,
    title: row.title,
    status: row.status,
    dueAt: row.dueAt,
    unitId: row.unitId,
    spaceId: row.spaceId,
    assetId: row.assetId,
    pmOccurrenceId: row.pmOccurrenceId,
    workOrderKind: row.workOrderKind,
  }));
}

/**
 * Own call-off on today's shift for this Department. Does not invent uncovered
 * staffing or project other employees' call-offs onto Job Flow.
 */
export async function loadOwnCallOffAssignmentExceptions(input: {
  facilityId: string;
  departmentId: string;
  employeeId: string;
  now?: Date;
}): Promise<JobFlowAssignmentExceptionSource[]> {
  const now = input.now ?? new Date();
  const facilityTimezone = await loadFacilityTimezone(prisma, input.facilityId);
  const window = getFacilityLocalTodayWindow(facilityTimezone, now);
  const dateIso = buildOperationalTimeContext({ now, facilityTimezone }).facilityLocalDate;

  const entry = await prisma.scheduleEntry.findFirst({
    where: {
      employeeId: input.employeeId,
      employee: { facilityId: input.facilityId },
      calledOffAt: { not: null },
      date: { gte: window.start, lt: window.end },
      ...presenceCallOffDepartmentWhere(input.departmentId),
    },
    select: {
      id: true,
      callOffReason: true,
      unitId: true,
      calledOffAt: true,
    },
    orderBy: { calledOffAt: "desc" },
  });

  if (!entry) return [];

  return [
    {
      id: `call-off:${entry.id}`,
      kind: "CALL_OFF",
      label: entry.callOffReason?.trim() || "Shift called off",
      ownerState: "CALL_OFF",
      unitId: entry.unitId,
      href: `/staffing?date=${dateIso}`,
    },
  ];
}
