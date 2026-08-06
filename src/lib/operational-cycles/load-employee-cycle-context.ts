import type { AppJwtPayload } from "@/lib/auth";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

import { resolveCycleAuthority } from "./cycle-authority";
import { loadPublishedCyclesForDate } from "./load-published-cycles";
import {
  describeOperationalCycleContext,
  resolveOperationalCycle,
} from "./resolve-operational-cycle";
import type { OperationalCycleContext, UnitMealTarget } from "./types";

export type EmployeeCycleContextCard = {
  facilityId: string;
  departmentId: string;
  unitId: string | null;
  operationalDateKey: string;
  context: OperationalCycleContext;
  description: string;
  mealTargets: UnitMealTarget[];
};

/**
 * Read-only operational cycle card for employee / unit runtime.
 * Draft cycles are never visible.
 */
export async function loadEmployeeCycleContext(input: {
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  unitId?: string | null;
  now?: Date;
}): Promise<EmployeeCycleContextCard | null> {
  const authority = await resolveCycleAuthority(
    input.session,
    input.facilityId,
    input.departmentId,
  );
  if (!authority.canViewRuntime) {
    return null;
  }

  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(prisma, input.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone, now));

  const cycles = await loadPublishedCyclesForDate(
    input.facilityId,
    input.departmentId,
    operationalDateKey,
  );

  let unit: { id: string; unitType: import("@prisma/client").UnitType } | null = null;
  let mealTargets: UnitMealTarget[] = [];

  if (input.unitId) {
    const row = await prisma.unit.findFirst({
      where: {
        id: input.unitId,
        facilityId: input.facilityId,
        isActive: true,
      },
      select: {
        id: true,
        unitType: true,
        mealTimes: {
          where: { isActive: true },
          select: { mealType: true, scheduledTime: true },
        },
      },
    });
    if (!row) return null;
    unit = { id: row.id, unitType: row.unitType };
    mealTargets = row.mealTimes.map((m) => ({
      mealType: m.mealType,
      scheduledTime: m.scheduledTime,
    }));
  }

  const context = resolveOperationalCycle({
    cycles,
    now,
    facilityTimezone: timezone,
    operationalDateKey,
    unit,
    mealTargets,
  });

  return {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    unitId: unit?.id ?? null,
    operationalDateKey,
    context,
    description: describeOperationalCycleContext(context),
    mealTargets,
  };
}
