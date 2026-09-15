/**
 * Canonical Shift persistence service (RUN Staffing Phase 3).
 *
 * Creates ScheduleEntry rows as clock-time presence:
 *   - departmentId required
 *   - plannedStart / plannedEnd required
 *   - unitId = null, roleType = null
 *   - shift = FULL_DAY (schema compatibility; not user-facing primary semantics)
 *
 * Does NOT create OperationalAssignment.
 */

import { ShiftType } from "@prisma/client";

import { employeeBelongsToDepartment } from "@/lib/employee-membership";
import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import {
  validateCanonicalShiftTimes,
  validateEmployeeEligibleForDepartmentShift,
  validateNoShiftOverlap,
  validateServiceDateKey,
} from "./canonical-shift-validation";

function dayWindow(serviceDate: string): { start: Date; end: Date } {
  const start = facilityLocalDateToServiceDate(serviceDate);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

async function loadExistingIntervalsForEmployee(input: {
  facilityId: string;
  employeeId: string;
  serviceDate: string;
}): Promise<Array<{ id: string; plannedStart: string | null; plannedEnd: string | null }>> {
  const { start, end } = dayWindow(input.serviceDate);
  return prisma.scheduleEntry.findMany({
    where: {
      employeeId: input.employeeId,
      date: { gte: start, lt: end },
      employee: { facilityId: input.facilityId },
    },
    select: { id: true, plannedStart: true, plannedEnd: true },
  });
}

export async function createCanonicalShift(input: {
  facilityId: string;
  employeeId: string;
  departmentId: string;
  serviceDate: string;
  plannedStart: string;
  plannedEnd: string;
  workShiftId?: string | null;
  createdByUserId?: string | null;
}): Promise<{ id: string }> {
  const dateCheck = validateServiceDateKey(input.serviceDate);
  if (!dateCheck.ok) throw new Error(dateCheck.error);

  let plannedStart = input.plannedStart.trim();
  let plannedEnd = input.plannedEnd.trim();
  let workShiftId = input.workShiftId?.trim() || null;

  if (workShiftId) {
    const pattern = await prisma.workShift.findFirst({
      where: {
        id: workShiftId,
        facilityId: input.facilityId,
        isActive: true,
        OR: [{ departmentId: input.departmentId }, { departmentId: null }],
      },
      select: { id: true, startLocal: true, endLocal: true },
    });
    if (!pattern) throw new Error("WorkShift pattern not found.");
    // Selecting a WorkShift copies start/end into the date-specific Shift.
    plannedStart = pattern.startLocal;
    plannedEnd = pattern.endLocal;
    workShiftId = pattern.id;
  }

  const timeCheck = validateCanonicalShiftTimes({ plannedStart, plannedEnd });
  if (!timeCheck.ok) throw new Error(timeCheck.error);

  const [employee, department] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: input.employeeId, facilityId: input.facilityId },
      select: {
        id: true,
        facilityId: true,
        status: true,
        primaryDepartmentId: true,
        employeeDepartments: { select: { departmentId: true } },
      },
    }),
    prisma.department.findFirst({
      where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
      select: { id: true },
    }),
  ]);

  if (!department) throw new Error("Department not found.");

  const eligibility = validateEmployeeEligibleForDepartmentShift(
    employee
      ? {
          id: employee.id,
          facilityId: employee.facilityId,
          status: employee.status,
          belongsToDepartment: employeeBelongsToDepartment(employee, input.departmentId),
        }
      : null,
    { facilityId: input.facilityId, departmentId: input.departmentId },
  );
  if (!eligibility.ok) throw new Error(eligibility.error);

  const existing = await loadExistingIntervalsForEmployee({
    facilityId: input.facilityId,
    employeeId: input.employeeId,
    serviceDate: input.serviceDate,
  });
  const overlap = validateNoShiftOverlap({
    plannedStart,
    plannedEnd,
    existing,
  });
  if (!overlap.ok) throw new Error(overlap.error);

  const created = await prisma.scheduleEntry.create({
    data: {
      employeeId: input.employeeId,
      departmentId: input.departmentId,
      date: facilityLocalDateToServiceDate(input.serviceDate),
      plannedStart,
      plannedEnd,
      workShiftId,
      // Compatibility defaults — not canonical Shift semantics.
      shift: ShiftType.FULL_DAY,
      unitId: null,
      roleType: null,
      createdById: input.createdByUserId ?? undefined,
    },
    select: { id: true },
  });

  return created;
}

export async function editCanonicalShift(input: {
  facilityId: string;
  shiftId: string;
  plannedStart: string;
  plannedEnd: string;
  workShiftId?: string | null;
}): Promise<void> {
  const existing = await prisma.scheduleEntry.findFirst({
    where: { id: input.shiftId, employee: { facilityId: input.facilityId } },
    select: {
      id: true,
      employeeId: true,
      date: true,
      departmentId: true,
    },
  });
  if (!existing) throw new Error("Shift not found.");

  let plannedStart = input.plannedStart.trim();
  let plannedEnd = input.plannedEnd.trim();
  let workShiftId =
    input.workShiftId === undefined ? undefined : input.workShiftId?.trim() || null;

  if (workShiftId) {
    const pattern = await prisma.workShift.findFirst({
      where: {
        id: workShiftId,
        facilityId: input.facilityId,
        isActive: true,
        OR: existing.departmentId
          ? [{ departmentId: existing.departmentId }, { departmentId: null }]
          : [{ departmentId: null }],
      },
      select: { id: true, startLocal: true, endLocal: true },
    });
    if (!pattern) throw new Error("WorkShift pattern not found.");
    plannedStart = pattern.startLocal;
    plannedEnd = pattern.endLocal;
    workShiftId = pattern.id;
  }

  const timeCheck = validateCanonicalShiftTimes({ plannedStart, plannedEnd });
  if (!timeCheck.ok) throw new Error(timeCheck.error);

  const serviceDate = `${String(existing.date.getUTCFullYear()).padStart(4, "0")}-${String(existing.date.getUTCMonth() + 1).padStart(2, "0")}-${String(existing.date.getUTCDate()).padStart(2, "0")}`;
  const siblings = await loadExistingIntervalsForEmployee({
    facilityId: input.facilityId,
    employeeId: existing.employeeId,
    serviceDate,
  });
  const overlap = validateNoShiftOverlap({
    plannedStart,
    plannedEnd,
    existing: siblings,
    excludeShiftId: existing.id,
  });
  if (!overlap.ok) throw new Error(overlap.error);

  await prisma.scheduleEntry.update({
    where: { id: existing.id },
    data: {
      plannedStart,
      plannedEnd,
      ...(workShiftId !== undefined ? { workShiftId } : {}),
      // Do not mutate unitId / roleType / departmentId / Daily Assignment.
    },
  });
}

/**
 * Copy one Shift's times onto one or more target service dates for the same employee.
 * Does NOT copy Daily Assignments. Validates overlaps per target day.
 */
export async function copyCanonicalShiftToDays(input: {
  facilityId: string;
  sourceShiftId: string;
  targetServiceDates: string[];
  createdByUserId?: string | null;
}): Promise<{ createdIds: string[]; skipped: Array<{ serviceDate: string; reason: string }> }> {
  const source = await prisma.scheduleEntry.findFirst({
    where: { id: input.sourceShiftId, employee: { facilityId: input.facilityId } },
    select: {
      id: true,
      employeeId: true,
      departmentId: true,
      plannedStart: true,
      plannedEnd: true,
      workShiftId: true,
      date: true,
    },
  });
  if (!source) throw new Error("Shift not found.");
  if (!source.departmentId) {
    throw new Error("Cannot copy a legacy unit/meal shift. Recreate it as a Department Shift first.");
  }
  if (!source.plannedStart || !source.plannedEnd) {
    throw new Error("Source shift is missing start/end times.");
  }

  const uniqueTargets = [
    ...new Set(
      input.targetServiceDates
        .map((d) => d.trim())
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ),
  ];
  if (uniqueTargets.length === 0) {
    throw new Error("Select at least one day to copy to.");
  }

  const sourceServiceDate = `${String(source.date.getUTCFullYear()).padStart(4, "0")}-${String(source.date.getUTCMonth() + 1).padStart(2, "0")}-${String(source.date.getUTCDate()).padStart(2, "0")}`;
  const createdIds: string[] = [];
  const skipped: Array<{ serviceDate: string; reason: string }> = [];

  for (const serviceDate of uniqueTargets) {
    if (serviceDate === sourceServiceDate) {
      skipped.push({ serviceDate, reason: "Same as source day." });
      continue;
    }
    try {
      const created = await createCanonicalShift({
        facilityId: input.facilityId,
        employeeId: source.employeeId,
        departmentId: source.departmentId,
        serviceDate,
        plannedStart: source.plannedStart,
        plannedEnd: source.plannedEnd,
        workShiftId: source.workShiftId,
        createdByUserId: input.createdByUserId,
      });
      createdIds.push(created.id);
    } catch (error) {
      skipped.push({
        serviceDate,
        reason: error instanceof Error ? error.message : "Could not copy.",
      });
    }
  }

  if (createdIds.length === 0 && skipped.length > 0) {
    throw new Error(
      skipped.map((s) => `${s.serviceDate}: ${s.reason}`).join(" "),
    );
  }

  return { createdIds, skipped };
}

export async function deleteCanonicalShift(input: {
  facilityId: string;
  shiftId: string;
}): Promise<{ hadDailyAssignment: boolean }> {
  const existing = await prisma.scheduleEntry.findFirst({
    where: { id: input.shiftId, employee: { facilityId: input.facilityId } },
    select: {
      id: true,
      employeeId: true,
      date: true,
      departmentId: true,
    },
  });
  if (!existing) throw new Error("Shift not found.");

  const oaServiceDate = facilityLocalDateToServiceDate(
    `${String(existing.date.getUTCFullYear()).padStart(4, "0")}-${String(existing.date.getUTCMonth() + 1).padStart(2, "0")}-${String(existing.date.getUTCDate()).padStart(2, "0")}`,
  );

  const oaCount = await prisma.operationalAssignment.count({
    where: {
      facilityId: input.facilityId,
      employeeId: existing.employeeId,
      serviceDate: oaServiceDate,
      status: { in: ["PLANNED", "ACTIVE"] },
      ...(existing.departmentId ? { departmentId: existing.departmentId } : {}),
    },
  });

  await prisma.scheduleEntry.delete({ where: { id: existing.id } });
  return { hadDailyAssignment: oaCount > 0 };
}
