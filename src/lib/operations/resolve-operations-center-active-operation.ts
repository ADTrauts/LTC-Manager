import type { PrismaClient } from "@prisma/client";

import type { OperationsCenterMealBoard, OperationsCenterUnitCard } from "@/lib/operations-center";

import { resolveActiveOperation, type ResolveActiveOperationDeps } from "./resolve-active-operation";
import type { ResolvedActiveOperation } from "./types";

/** Stable scope key used before OperationDefinition rows exist for a facility. */
export function legacyOperationsCenterDepartmentId(facilityId: string): string {
  return `legacy:${facilityId}:dietary`;
}

export async function resolveOperationsCenterDepartmentId(
  prisma: PrismaClient,
  facilityId: string,
): Promise<string> {
  const definition = await prisma.operationDefinition.findFirst({
    where: { facilityId, isActive: true },
    select: { departmentId: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  return definition?.departmentId ?? legacyOperationsCenterDepartmentId(facilityId);
}

export async function resolveOperationsCenterActiveOperation(
  prisma: PrismaClient,
  input: {
    facilityId: string;
    now: Date;
    unitCards: OperationsCenterUnitCard[];
    mealBoards: OperationsCenterMealBoard[];
  },
  deps: ResolveActiveOperationDeps = {},
): Promise<ResolvedActiveOperation> {
  const departmentId = await resolveOperationsCenterDepartmentId(prisma, input.facilityId);

  return resolveActiveOperation(
    {
      facilityId: input.facilityId,
      departmentId,
      now: input.now,
      heuristicHints: {
        unitCards: input.unitCards,
        mealBoards: input.mealBoards,
      },
    },
    deps,
  );
}
