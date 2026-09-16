/**
 * Employee-day Shift query.
 *
 * Answers: What are Sharon's shifts for September 3 in Dietary?
 * Future Gentle Hand infrastructure — no My Day UI in this phase.
 */

import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import {
  buildEmployeeShiftProjection,
  type EmployeeShiftProjection,
} from "./employee-shift-projection";
import { formatShiftWindow12h } from "./shift-clock-time";

export type EmployeeDayShifts = {
  facilityId: string;
  employeeId: string;
  departmentId: string | null;
  serviceDate: string;
  projection: EmployeeShiftProjection;
  shiftWindowLabels: string[];
};

export async function loadEmployeeDayShifts(input: {
  facilityId: string;
  employeeId: string;
  serviceDate: string;
  departmentId?: string | null;
}): Promise<EmployeeDayShifts | null> {
  const { facilityId, employeeId, serviceDate, departmentId } = input;
  const start = facilityLocalDateToServiceDate(serviceDate);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const oaServiceDate = facilityLocalDateToServiceDate(serviceDate);

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, facilityId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      departmentJobRoles: {
        where: {
          ...(departmentId ? { departmentId } : {}),
          jobRole: { status: "ACTIVE" },
        },
        select: { jobRole: { select: { displayName: true } }, departmentId: true },
        take: 1,
      },
        teamMemberships: {
          where: departmentId
            ? { team: { departmentId, status: "ACTIVE" } }
            : { team: { status: "ACTIVE" } },
          select: { team: { select: { displayName: true } }, isPrimary: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
        },
    },
  });
  if (!employee) return null;

  const [scheduleEntries, assignments] = await Promise.all([
    prisma.scheduleEntry.findMany({
      where: {
        employeeId,
        date: { gte: start, lt: end },
        ...(departmentId
          ? {
              OR: [{ departmentId }, { departmentId: null }],
            }
          : {}),
      },
      select: {
        id: true,
        plannedStart: true,
        plannedEnd: true,
        shift: true,
        departmentId: true,
        unitId: true,
        workShiftId: true,
      },
      orderBy: [{ plannedStart: "asc" }, { createdAt: "asc" }],
    }),
    prisma.operationalAssignment.findMany({
      where: {
        facilityId,
        employeeId,
        serviceDate: oaServiceDate,
        status: { in: ["PLANNED", "ACTIVE"] },
        ...(departmentId ? { departmentId } : {}),
      },
      select: {
        id: true,
        roleLabel: true,
        status: true,
        startsAt: true,
        endsAt: true,
        unit: { select: { name: true } },
        locations: {
          select: {
            labelSnapshot: true,
            unitSpace: { select: { name: true, roomNumber: true } },
          },
        },
      },
    }),
  ]);

  // If department filter is set, keep only matching or legacy-null shifts for that employee context.
  const filteredEntries = departmentId
    ? scheduleEntries.filter((s) => s.departmentId === departmentId || s.departmentId == null)
    : scheduleEntries;

  const projection = buildEmployeeShiftProjection({
    employeeId: employee.id,
    employeeFirstName: employee.firstName,
    employeeLastName: employee.lastName,
    jobRoleDisplayName: employee.departmentJobRoles[0]?.jobRole.displayName ?? null,
    teamDisplayName: employee.teamMemberships[0]?.team.displayName ?? null,
    serviceDate,
    scheduleEntries: filteredEntries.map((s) => ({
      id: s.id,
      plannedStart: s.plannedStart,
      plannedEnd: s.plannedEnd,
      shift: s.shift,
      departmentId: s.departmentId,
      unitId: s.unitId,
      workShiftId: s.workShiftId,
    })),
    operationalAssignments: assignments.map((a) => ({
      id: a.id,
      roleLabel: a.roleLabel,
      scopeSummaryLabel:
        a.locations.length > 0
          ? `${a.locations.length} Room${a.locations.length === 1 ? "" : "s"}`
          : a.unit?.name
            ? `${a.unit.name} (entire Unit)`
            : "Assigned coverage",
      status: a.status,
      startsAt: a.startsAt?.toISOString() ?? null,
      endsAt: a.endsAt?.toISOString() ?? null,
    })),
  });

  return {
    facilityId,
    employeeId,
    departmentId: departmentId ?? null,
    serviceDate,
    projection,
    shiftWindowLabels: projection.shifts
      .map((s) => formatShiftWindow12h(s) ?? (s.shiftSlot ? `Legacy: ${s.shiftSlot}` : null))
      .filter((v): v is string => Boolean(v)),
  };
}
