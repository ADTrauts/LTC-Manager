import type { MealType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { UnitWorkspaceUnit } from "./types";

export async function loadUnitRecord(facilityId: string, unitId: string): Promise<UnitWorkspaceUnit | null> {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, facilityId },
    select: {
      id: true,
      name: true,
      unitType: true,
      isActive: true,
      parentUnitId: true,
      mealTimes: {
        where: { isActive: true },
        orderBy: { mealType: "asc" },
        select: { mealType: true, scheduledTime: true },
      },
    },
  });

  if (!unit || !unit.isActive) {
    return null;
  }

  const dietary = await prisma.department.findFirst({
    where: { facilityId, key: "DIETARY", isActive: true },
    select: { id: true },
  });
  if (!dietary) {
    return unit;
  }

  const {
    materializeMealServiceDayExpectations,
    mealTargetsFromTimings,
    timingsForOwnerUnits,
  } = await import("@/lib/operational-cycles/materialize-day-expectations");
  const { timingOwnerUnitIds } = await import("@/lib/operational-cycles/plan-day-expectations");
  const materialized = await materializeMealServiceDayExpectations({
    facilityId,
    departmentId: dietary.id,
  });
  const ownerIds = timingOwnerUnitIds({ id: unit.id, parentUnitId: unit.parentUnitId });
  const unitTimings = timingsForOwnerUnits(materialized.timings, ownerIds);
  if (unitTimings.length === 0) {
    return unit;
  }

  const expected = mealTargetsFromTimings(unitTimings, ownerIds);
  const mealTimes =
    expected.length > 0
      ? expected.map((row) => ({
          mealType: row.mealType as MealType,
          scheduledTime: row.scheduledTime,
        }))
      : unitTimings.map((row) => ({
          mealType: row.mealType as MealType,
          scheduledTime: "",
        }));

  return {
    id: unit.id,
    name: unit.name,
    unitType: unit.unitType,
    isActive: unit.isActive,
    mealTimes,
  };
}
