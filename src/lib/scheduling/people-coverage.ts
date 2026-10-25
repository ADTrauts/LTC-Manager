import { OperationalAssignmentSource } from "@prisma/client";

import { facilityLocalDateToServiceDate } from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { formatCallDownReason, isCallDownTemplateKey } from "./call-down";

const MOVE_TEMPLATES = new Set(["reassigned-for-coverage", "emergency-coverage"]);

export function peopleChangeIsMove(template: string | null | undefined): boolean {
  return template != null && MOVE_TEMPLATES.has(template);
}

function dayWindow(serviceDate: string): { start: Date; end: Date } {
  const start = facilityLocalDateToServiceDate(serviceDate);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function markShiftsCalledOff(input: {
  facilityId: string;
  employeeId: string;
  serviceDate: string;
  reason: string;
  now?: Date;
}): Promise<{ marked: number }> {
  const { start, end } = dayWindow(input.serviceDate);
  const shifts = await prisma.scheduleEntry.findMany({
    where: {
      employeeId: input.employeeId,
      date: { gte: start, lt: end },
      employee: { facilityId: input.facilityId },
    },
    select: { id: true },
  });
  if (shifts.length === 0) {
    throw new Error("No shift on that date to mark.");
  }
  const calledOffAt = input.now ?? new Date();
  await prisma.scheduleEntry.updateMany({
    where: { id: { in: shifts.map((shift) => shift.id) } },
    data: { calledOffAt, callOffReason: input.reason },
  });
  return { marked: shifts.length };
}

export async function moveDayAssignment(input: {
  facilityId: string;
  employeeId: string;
  serviceDate: string;
  unitId: string;
  reason: string;
  actorUserId: string | null;
}): Promise<{ moved: number }> {
  const serviceDate = facilityLocalDateToServiceDate(input.serviceDate);
  const unit = await prisma.unit.findFirst({
    where: { id: input.unitId, facilityId: input.facilityId },
    select: { id: true },
  });
  if (!unit) throw new Error("Location not found.");
  const assignments = await prisma.operationalAssignment.findMany({
    where: {
      facilityId: input.facilityId,
      employeeId: input.employeeId,
      serviceDate,
      status: { not: "CANCELLED" },
    },
    select: { id: true, unitId: true, departmentId: true, status: true },
  });
  if (assignments.length === 0) {
    throw new Error("No assignment on that date to move.");
  }
  const now = new Date();
  await prisma.$transaction(
    assignments.flatMap((assignment) => [
      prisma.operationalAssignment.update({
        where: { id: assignment.id },
        data: {
          unitId: unit.id,
          changeReason: input.reason,
          source: OperationalAssignmentSource.REASSIGNMENT,
          lastChangedByUserId: input.actorUserId,
          lastChangedAt: now,
        },
      }),
      prisma.operationalAssignmentEvent.create({
        data: {
          assignmentId: assignment.id,
          facilityId: input.facilityId,
          departmentId: assignment.departmentId,
          employeeId: input.employeeId,
          unitId: unit.id,
          serviceDate,
          eventType: "REASSIGNED",
          actorUserId: input.actorUserId,
          fromStatus: assignment.status,
          toStatus: assignment.status,
          summary: "Moved to another location",
          reason: input.reason,
          priorValuesJson: JSON.stringify({ unitId: assignment.unitId }),
          newValuesJson: JSON.stringify({ unitId: unit.id }),
        },
      }),
    ]),
  );
  return { moved: assignments.length };
}

export function callOffReasonFromForm(input: {
  reasonTemplate?: string | null;
  reasonDetails?: string | null;
  reason?: string | null;
}): string {
  const template = input.reasonTemplate?.trim();
  const details = input.reasonDetails?.trim();
  if (template && isCallDownTemplateKey(template)) {
    return formatCallDownReason(template, details);
  }
  const freeText = input.reason?.trim() || details;
  if (!freeText || freeText.length < 3) {
    throw new Error("Reason must be at least 3 characters.");
  }
  return freeText;
}
