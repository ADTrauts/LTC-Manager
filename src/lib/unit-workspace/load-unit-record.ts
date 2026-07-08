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

  return unit;
}
