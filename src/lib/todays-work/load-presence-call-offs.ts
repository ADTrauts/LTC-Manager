/**
 * Presence call-offs for Today's Work.
 * AssignmentOverride rows with a parsed call-down reason, today only.
 * Does not evaluate ScheduleEntry coverage or dashboard aggregates.
 */

import type { Prisma } from "@prisma/client";

import {
  buildOperationalTimeContext,
  getFacilityLocalTodayWindow,
  loadFacilityTimezone,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import {
  parseCallDownReason,
  summarizeCallDowns,
  type CallDownData,
  type CallDownItem,
  type CallDownOverrideRecord,
} from "./call-down";

export function buildPresenceCallOffItems(args: {
  overrides: CallDownOverrideRecord[];
  dateIso: string;
}): CallDownItem[] {
  const items: CallDownItem[] = [];
  for (const override of args.overrides) {
    const parsed = parseCallDownReason(override.reason);
    if (!parsed.isCallDown) {
      continue;
    }

    const affectedUnitId = override.oldUnitId ?? override.newUnitId;
    items.push({
      id: override.id,
      employeeName: `${override.employeeFirstName} ${override.employeeLastName}`,
      templateKey: parsed.templateKey,
      templateLabel: parsed.templateLabel,
      reason: parsed.displayReason,
      reasonDetails: parsed.details,
      oldUnitId: override.oldUnitId,
      oldUnitName: override.oldUnitName,
      newUnitId: override.newUnitId,
      newUnitName: override.newUnitName,
      mealType: override.mealType,
      status: "open",
      statusLabel: parsed.templateLabel ?? "Call-off",
      changedAt: override.changedAt,
      staffingHref: `/staffing?date=${args.dateIso}`,
      coverageHref: `/staffing/assignments?date=${args.dateIso}${
        affectedUnitId ? `&unit=${affectedUnitId}` : ""
      }`,
    });
  }
  return items.sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
}

/**
 * A call-off belongs to its shift's Department. Overrides without a Department-bound shift
 * belong to the employee's primary Department.
 */
export function presenceCallOffDepartmentWhere(departmentId: string): Prisma.AssignmentOverrideWhereInput {
  return {
    OR: [
      { scheduleEntry: { is: { departmentId } } },
      { scheduleEntry: { is: null }, employee: { primaryDepartmentId: departmentId } },
      { scheduleEntry: { is: { departmentId: null } }, employee: { primaryDepartmentId: departmentId } },
    ],
  };
}

export async function loadPresenceCallOffs(
  facilityId: string,
  options: { departmentId?: string } = {},
): Promise<CallDownData> {
  const now = new Date();
  const facilityTimezone = await loadFacilityTimezone(prisma, facilityId);
  const window = getFacilityLocalTodayWindow(facilityTimezone, now);
  const dateIso = buildOperationalTimeContext({ now, facilityTimezone }).facilityLocalDate;

  const overrides = await prisma.assignmentOverride.findMany({
    where: {
      date: { gte: window.start, lt: window.end },
      employee: { facilityId },
      ...(options.departmentId ? presenceCallOffDepartmentWhere(options.departmentId) : {}),
    },
    orderBy: { changedAt: "desc" },
    select: {
      id: true,
      employeeId: true,
      oldUnitId: true,
      newUnitId: true,
      mealType: true,
      reason: true,
      changedAt: true,
      employee: { select: { firstName: true, lastName: true } },
      oldUnit: { select: { name: true } },
      newUnit: { select: { name: true } },
    },
  });

  const items = buildPresenceCallOffItems({
    overrides: overrides.map((entry) => ({
      id: entry.id,
      employeeId: entry.employeeId,
      employeeFirstName: entry.employee.firstName,
      employeeLastName: entry.employee.lastName,
      oldUnitId: entry.oldUnitId,
      oldUnitName: entry.oldUnit?.name ?? null,
      newUnitId: entry.newUnitId,
      newUnitName: entry.newUnit.name,
      mealType: entry.mealType,
      reason: entry.reason,
      changedAt: entry.changedAt,
    })),
    dateIso,
  });

  return {
    items,
    summary: summarizeCallDowns(items),
    dateIso,
  };
}
