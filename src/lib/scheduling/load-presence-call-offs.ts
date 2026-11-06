/**
 * Presence call-offs.
 * A call-off is a mark on the shift. Today only.
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
 * A call-off belongs to its shift's Department. A shift without a Department
 * belongs to the employee's primary Department.
 */
export function presenceCallOffDepartmentWhere(departmentId: string): Prisma.ScheduleEntryWhereInput {
  return {
    OR: [
      { departmentId },
      { departmentId: null, employee: { primaryDepartmentId: departmentId } },
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

  const shifts = await prisma.scheduleEntry.findMany({
    where: {
      calledOffAt: { not: null },
      date: { gte: window.start, lt: window.end },
      employee: { facilityId },
      ...(options.departmentId ? presenceCallOffDepartmentWhere(options.departmentId) : {}),
    },
    orderBy: { calledOffAt: "desc" },
    select: {
      id: true,
      employeeId: true,
      unitId: true,
      shift: true,
      callOffReason: true,
      calledOffAt: true,
      employee: { select: { firstName: true, lastName: true } },
      unit: { select: { name: true } },
    },
  });

  const items = buildPresenceCallOffItems({
    overrides: shifts.map((entry) => ({
      id: entry.id,
      employeeId: entry.employeeId,
      employeeFirstName: entry.employee.firstName,
      employeeLastName: entry.employee.lastName,
      oldUnitId: null,
      oldUnitName: null,
      newUnitId: entry.unitId ?? entry.id,
      newUnitName: entry.unit?.name ?? "Schedule",
      mealType:
        entry.shift === "BREAKFAST" || entry.shift === "LUNCH" || entry.shift === "DINNER"
          ? entry.shift
          : null,
      reason: entry.callOffReason ?? "Call-off",
      changedAt: entry.calledOffAt ?? now,
    })),
    dateIso,
  });

  return {
    items,
    summary: summarizeCallDowns(items),
    dateIso,
  };
}
