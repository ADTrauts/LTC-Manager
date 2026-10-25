import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { parseCallDownReason } from "@/lib/scheduling/call-down";
import { prisma } from "@/lib/prisma";

import { detectOverlappingAssignments } from "./detect-assignment-conflicts";
import { summarizeAssignmentScopeHierarchy } from "@/lib/scheduling/assignment-scope-summary";
import type {
  AssignmentBoardEmployee,
  AssignmentBoardEntry,
  AssignmentWarning,
  DailyAssignmentBoardData,
} from "./types";

export type LoadDailyAssignmentBoardInput = {
  facilityId: string;
  serviceDate: string;
  departmentId?: string | null;
  departmentKey?: OperationalDepartmentKey | null;
};

/**
 * Load the Daily Assignment Board for a given facility and service date.
 * Combines ScheduleEntry (who is working, including a call-off mark)
 * and OperationalAssignment (role/task placement) into one coordinated view.
 */
export async function loadDailyAssignmentBoard(
  input: LoadDailyAssignmentBoardInput,
): Promise<DailyAssignmentBoardData> {
  const { facilityId, serviceDate, departmentId } = input;
  const dateStart = new Date(`${serviceDate}T00:00:00`);
  const dateEnd = new Date(`${serviceDate}T23:59:59.999`);

  const deptFilter = departmentId ? { departmentId } : {};

  const [scheduleEntries, assignments, units] = await Promise.all([
    prisma.scheduleEntry.findMany({
      where: {
        date: { gte: dateStart, lte: dateEnd },
        unit: { facilityId },
        ...(departmentId
          ? { employee: { employeeDepartments: { some: { departmentId } } } }
          : {}),
      },
      select: {
        id: true,
        employeeId: true,
        shift: true,
        plannedStart: true,
        plannedEnd: true,
        calledOffAt: true,
        callOffReason: true,
        unit: { select: { id: true, name: true } },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            primaryDepartment: { select: { key: true, name: true } },
          },
        },
      },
    }),
    prisma.operationalAssignment.findMany({
      where: {
        facilityId,
        serviceDate: dateStart,
        ...deptFilter,
      },
      select: {
        id: true,
        employeeId: true,
        roleKey: true,
        roleLabel: true,
        unitId: true,
        unit: { select: { name: true, isActive: true } },
        startsAt: true,
        endsAt: true,
        status: true,
        source: true,
        notes: true,
        sourceZoneId: true,
        sourceZone: { select: { name: true } },
        locations: {
          select: {
            unitSpaceId: true,
            labelSnapshot: true,
            sortOrder: true,
            unitSpace: {
              select: {
                name: true,
                roomNumber: true,
                unit: {
                  select: {
                    name: true,
                    hierarchyRole: true,
                    parentUnit: { select: { name: true } },
                  },
                },
              },
            },
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    prisma.unit.findMany({
      where: { facilityId, isActive: true },
      select: { id: true, name: true, isActive: true },
    }),
  ]);

  const callOffReasonByEmployee = new Map<string, string>();
  for (const entry of scheduleEntries) {
    if (entry.calledOffAt && entry.callOffReason) {
      callOffReasonByEmployee.set(entry.employeeId, entry.callOffReason);
    }
  }

  const unitNameById = new Map(units.map((u) => [u.id, u.name]));

  const seenEmployeeIds = new Set<string>();
  const employees: AssignmentBoardEmployee[] = [];

  for (const entry of scheduleEntries) {
    if (seenEmployeeIds.has(entry.employeeId)) continue;
    seenEmployeeIds.add(entry.employeeId);

    const callOffReason = callOffReasonByEmployee.get(entry.employeeId) ?? null;

    employees.push({
      id: entry.employee.id,
      firstName: entry.employee.firstName,
      lastName: entry.employee.lastName,
      departmentKey: entry.employee.primaryDepartment?.key ?? null,
      departmentName: entry.employee.primaryDepartment?.name ?? null,
      scheduledShift: entry.shift,
      plannedStart: entry.plannedStart,
      plannedEnd: entry.plannedEnd,
      unitName: entry.unit?.name ?? null,
      hasCallDown: callOffReason != null,
      callDownReason: callOffReason ? parseCallDownReason(callOffReason).displayReason : null,
    });
  }

  const boardEntries: AssignmentBoardEntry[] = assignments.map((a) => {
    const locationLabels = a.locations.map(
      (l) =>
        l.labelSnapshot?.trim() ||
        [l.unitSpace.roomNumber, l.unitSpace.name].filter(Boolean).join(" • ") ||
        l.unitSpace.name,
    );

    const scopeSummaryLabel = summarizeAssignmentScopeHierarchy({
      locations: a.locations.map((l) => ({
        labelSnapshot: l.labelSnapshot,
        unitSpace: l.unitSpace,
      })),
      unitName: a.unit?.name ?? null,
    });

    return {
      id: a.id,
      employeeId: a.employeeId,
      roleKey: a.roleKey,
      roleLabel: a.roleLabel,
      unitId: a.unitId,
      unitName: a.unit?.name ?? (a.unitId ? unitNameById.get(a.unitId) ?? null : null),
      operationInstanceId: null,
      operationLabel: null,
      startsAt: a.startsAt?.toISOString() ?? null,
      endsAt: a.endsAt?.toISOString() ?? null,
      status: a.status,
      source: a.source,
      notes: a.notes,
      scopeKind: a.locations.length > 0 ? "SPACES" : "UNIT",
      locationCount: a.locations.length,
      scopeSummaryLabel,
      locationLabels,
      sourceZoneId: a.sourceZoneId,
      sourceZoneName: a.sourceZone?.name ?? null,
    };
  });

  const warnings = computeWarnings(employees, boardEntries, assignments);

  return {
    serviceDate,
    facilityId,
    departmentKey: input.departmentKey ?? null,
    employees,
    assignments: boardEntries,
    warnings,
  };
}

function computeWarnings(
  employees: AssignmentBoardEmployee[],
  boardEntries: AssignmentBoardEntry[],
  rawAssignments: Array<{
    id: string;
    unit?: { isActive: boolean } | null;
  }>,
): AssignmentWarning[] {
  const warnings: AssignmentWarning[] = [];
  const assignedEmployeeIds = new Set(
    boardEntries.filter((e) => e.status !== "CANCELLED").map((e) => e.employeeId),
  );

  for (const emp of employees) {
    if (emp.hasCallDown) continue;
    if (!assignedEmployeeIds.has(emp.id)) {
      warnings.push({
        kind: "unassigned_employee",
        employeeId: emp.id,
        message: `${emp.firstName} ${emp.lastName} is scheduled but has no operational assignment.`,
      });
    }
  }

  for (const a of rawAssignments) {
    if (a.unit && !a.unit.isActive) {
      warnings.push({
        kind: "inactive_unit",
        assignmentId: a.id,
        employeeId: "",
        message: "Assignment linked to an inactive unit.",
      });
    }
  }

  warnings.push(...detectOverlappingAssignments(boardEntries));

  return warnings;
}
