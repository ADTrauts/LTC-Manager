import type { MealType, PrismaClient } from "@prisma/client";

import { getTodayWindow } from "@/lib/operations-center/get-today-window";

export type OperationDefinitionForSync = {
  id: string;
  facilityId: string;
  departmentId: string;
  label: string;
  mealType: MealType | null;
  workShiftId: string | null;
  scheduledStartLocal: string | null;
  scheduledEndLocal: string | null;
  isActive: boolean;
};

export type ExistingOperationInstanceKey = {
  definitionId: string;
  serviceDate: Date;
};

export type OperationInstanceCreatePlan = {
  facilityId: string;
  departmentId: string;
  definitionId: string;
  serviceDate: Date;
  mealType: MealType | null;
  label: string;
  workShiftId: string | null;
  scheduledStartLocal: string | null;
  scheduledEndLocal: string | null;
};

export type SyncOperationInstancesResult = {
  facilityId: string;
  serviceDate: Date;
  definitionsConsidered: number;
  created: number;
  skippedExisting: number;
};

export function isSameServiceDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function hasOperationInstanceForDefinition(
  definitionId: string,
  serviceDate: Date,
  existing: ExistingOperationInstanceKey[],
): boolean {
  return existing.some(
    (row) => row.definitionId === definitionId && isSameServiceDate(row.serviceDate, serviceDate),
  );
}

export function buildOperationInstanceCreatePlans(input: {
  definitions: OperationDefinitionForSync[];
  existing: ExistingOperationInstanceKey[];
  serviceDate: Date;
}): OperationInstanceCreatePlan[] {
  const { definitions, existing, serviceDate } = input;
  const plans: OperationInstanceCreatePlan[] = [];

  for (const definition of definitions) {
    if (!definition.isActive) {
      continue;
    }
    if (hasOperationInstanceForDefinition(definition.id, serviceDate, existing)) {
      continue;
    }

    plans.push({
      facilityId: definition.facilityId,
      departmentId: definition.departmentId,
      definitionId: definition.id,
      serviceDate,
      mealType: definition.mealType,
      label: definition.label,
      workShiftId: definition.workShiftId,
      scheduledStartLocal: definition.scheduledStartLocal,
      scheduledEndLocal: definition.scheduledEndLocal,
    });
  }

  return plans;
}

export function summarizeSyncOperationInstances(input: {
  facilityId: string;
  serviceDate: Date;
  definitions: OperationDefinitionForSync[];
  existing: ExistingOperationInstanceKey[];
  createdCount: number;
}): SyncOperationInstancesResult {
  const activeDefinitions = input.definitions.filter((definition) => definition.isActive);
  const skippedExisting = activeDefinitions.filter((definition) =>
    hasOperationInstanceForDefinition(definition.id, input.serviceDate, input.existing),
  ).length;

  return {
    facilityId: input.facilityId,
    serviceDate: input.serviceDate,
    definitionsConsidered: activeDefinitions.length,
    created: input.createdCount,
    skippedExisting,
  };
}

export async function syncOperationInstancesForFacility(
  prisma: PrismaClient,
  input: {
    facilityId: string;
    serviceDate?: Date;
    now?: Date;
  },
): Promise<SyncOperationInstancesResult> {
  const now = input.now ?? new Date();
  const serviceDate = input.serviceDate ?? getTodayWindow(now).start;

  const definitions = await prisma.operationDefinition.findMany({
    where: { facilityId: input.facilityId },
    select: {
      id: true,
      facilityId: true,
      departmentId: true,
      label: true,
      mealType: true,
      workShiftId: true,
      scheduledStartLocal: true,
      scheduledEndLocal: true,
      isActive: true,
    },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  const existing = await prisma.operationInstance.findMany({
    where: {
      facilityId: input.facilityId,
      serviceDate,
    },
    select: {
      definitionId: true,
      serviceDate: true,
    },
  });

  const plans = buildOperationInstanceCreatePlans({
    definitions,
    existing,
    serviceDate,
  });

  let createdCount = 0;
  if (plans.length > 0) {
    const result = await prisma.operationInstance.createMany({
      data: plans.map((plan) => ({
        ...plan,
        status: "SCHEDULED" as const,
      })),
      skipDuplicates: true,
    });
    createdCount = result.count;
  }

  return summarizeSyncOperationInstances({
    facilityId: input.facilityId,
    serviceDate,
    definitions,
    existing,
    createdCount,
  });
}

export async function syncOperationInstances(
  prisma: PrismaClient,
  input: {
    facilityId?: string;
    serviceDate?: Date;
    now?: Date;
  } = {},
): Promise<SyncOperationInstancesResult[]> {
  if (input.facilityId) {
    return [await syncOperationInstancesForFacility(prisma, input as { facilityId: string; serviceDate?: Date; now?: Date })];
  }

  const facilities = await prisma.facility.findMany({
    select: { id: true },
    orderBy: { displayName: "asc" },
  });

  const results: SyncOperationInstancesResult[] = [];
  for (const facility of facilities) {
    results.push(
      await syncOperationInstancesForFacility(prisma, {
        facilityId: facility.id,
        serviceDate: input.serviceDate,
        now: input.now,
      }),
    );
  }

  return results;
}
