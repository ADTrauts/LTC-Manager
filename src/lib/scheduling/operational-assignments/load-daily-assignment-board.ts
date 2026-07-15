import type { OperationalDepartmentKey } from "@/lib/department-nav";
import { parseCallDownReason } from "@/lib/todays-work/call-down";
import { prisma } from "@/lib/prisma";

import { detectOverlappingAssignments } from "./detect-assignment-conflicts";
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
 * Combines ScheduleEntry (who is working), AssignmentOverride (call-offs/moves),
 * and OperationalAssignment (role/task placement) into one coordinated view.
 */
export async function loadDailyAssignmentBoard(
  input: LoadDailyAssignmentBoardInput,
): Promise<DailyAssignmentBoardData> {
  const { facilityId, serviceDate, departmentId } = input;
  const dateStart = new Date(`${serviceDate}T00:00:00`);
  const dateEnd = new Date(`${serviceDate}T23:59:59.999`);

  const deptFilter = departmentId ? { departmentId } : {};

  const [scheduleEntries, overrides, assignments, units] = await Promise.all([
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
    prisma.assignmentOverride.findMany({
      where: {
        date: { gte: dateStart, lte: dateEnd },
        employee: { facilityId },
      },
      select: {
        id: true,
        employeeId: true,
        reason: true,
        oldUnitId: true,
        newUnitId: true,
        mealType: true,
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
        operationInstanceId: true,
        operationInstance: { select: { label: true, status: true } },
        startsAt: true,
        endsAt: true,
        status: true,
        source: true,
        notes: true,
      },
    }),
    prisma.unit.findMany({
      where: { facilityId, isActive: true },
      select: { id: true, name: true, isActive: true },
    }),
  ]);

  const overridesByEmployee = new Map<string, typeof overrides>();
  for (const o of overrides) {
    const list = overridesByEmployee.get(o.employeeId) ?? [];
    list.push(o);
    overridesByEmployee.set(o.employeeId, list);
  }

  const unitNameById = new Map(units.map((u) => [u.id, u.name]));

  const seenEmployeeIds = new Set<string>();
  const employees: AssignmentBoardEmployee[] = [];

  for (const entry of scheduleEntries) {
    if (seenEmployeeIds.has(entry.employeeId)) continue;
    seenEmployeeIds.add(entry.employeeId);

    const empOverrides = overridesByEmployee.get(entry.employeeId) ?? [];
    const callDown = empOverrides.find((o) => {
      const parsed = parseCallDownReason(o.reason);
      return parsed.isCallDown;
    });

    employees.push({
      id: entry.employee.id,
      firstName: entry.employee.firstName,
      lastName: entry.employee.lastName,
      departmentKey: entry.employee.primaryDepartment?.key ?? null,
      departmentName: entry.employee.primaryDepartment?.name ?? null,
      scheduledShift: entry.shift,
      plannedStart: entry.plannedStart,
      plannedEnd: entry.plannedEnd,
      unitName: entry.unit.name,
      hasCallDown: !!callDown,
      callDownReason: callDown ? parseCallDownReason(callDown.reason).displayReason : null,
    });
  }

  const boardEntries: AssignmentBoardEntry[] = assignments.map((a) => ({
    id: a.id,
    employeeId: a.employeeId,
    roleKey: a.roleKey,
    roleLabel: a.roleLabel,
    unitId: a.unitId,
    unitName: a.unit?.name ?? (a.unitId ? unitNameById.get(a.unitId) ?? null : null),
    operationInstanceId: a.operationInstanceId,
    operationLabel: a.operationInstance?.label ?? null,
    startsAt: a.startsAt?.toISOString() ?? null,
    endsAt: a.endsAt?.toISOString() ?? null,
    status: a.status,
    source: a.source,
    notes: a.notes,
  }));

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
    operationInstance?: { status: string } | null;
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
    if (a.operationInstance && a.operationInstance.status === "CANCELLED") {
      warnings.push({
        kind: "cancelled_operation",
        assignmentId: a.id,
        employeeId: "",
        message: "Assignment linked to a cancelled operation.",
      });
    }
  }

  warnings.push(...detectOverlappingAssignments(boardEntries));

  return warnings;
}
