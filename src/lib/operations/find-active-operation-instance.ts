import { prisma } from "@/lib/prisma";
import { getDefaultMealTypeForTimeOfDay } from "@/lib/servery-meal-service";

import { hasOperationEnginePrisma } from "./operation-prisma";
import { pickActiveOperationInstance } from "./pick-active-operation-instance";
import { ACTIVE_OPERATION_INSTANCE_STATUSES, type ActiveOperationInstanceRow } from "./types";

export async function findActiveOperationInstance(input: {
  facilityId: string;
  departmentId: string;
  serviceDate: Date;
  now?: Date;
}): Promise<ActiveOperationInstanceRow | null> {
  if (!hasOperationEnginePrisma(prisma)) {
    return null;
  }

  const now = input.now ?? new Date();
  const instances = await prisma.operationInstance.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      serviceDate: input.serviceDate,
      status: { in: ACTIVE_OPERATION_INSTANCE_STATUSES },
    },
    select: {
      id: true,
      definitionId: true,
      facilityId: true,
      departmentId: true,
      serviceDate: true,
      mealType: true,
      label: true,
      status: true,
      scheduledStartLocal: true,
      scheduledEndLocal: true,
    },
  });

  return pickActiveOperationInstance(instances, getDefaultMealTypeForTimeOfDay(now));
}
