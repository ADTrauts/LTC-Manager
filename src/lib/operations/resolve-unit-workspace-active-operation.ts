import type { MealType, PrismaClient } from "@prisma/client";

import type {
  UnitWorkspaceMealServiceEventToday,
  UnitWorkspaceUnit,
} from "@/lib/unit-workspace/types";

import { hasOperationEnginePrisma } from "./operation-prisma";
import { resolveActiveOperation, type ResolveActiveOperationDeps } from "./resolve-active-operation";
import {
  legacyOperationsCenterDepartmentId,
  resolveOperationsCenterDepartmentId,
} from "./resolve-operations-center-active-operation";
import { resolveHeuristicActiveOperation } from "./resolve-heuristic-active-operation";
import type { ResolvedActiveOperation } from "./types";

export async function resolveUnitWorkspaceActiveOperation(
  prisma: PrismaClient,
  input: {
    facilityId: string;
    unit: UnitWorkspaceUnit;
    mealServiceEventByMeal: Map<MealType, UnitWorkspaceMealServiceEventToday>;
    now: Date;
    facilityTimezone?: string | null;
  },
  deps: ResolveActiveOperationDeps = {},
): Promise<ResolvedActiveOperation> {
  const unitHeuristicHints = {
    unit: input.unit,
    mealServiceEventByMeal: input.mealServiceEventByMeal,
  };

  if (!hasOperationEnginePrisma(prisma)) {
    return resolveHeuristicActiveOperation({
      facilityId: input.facilityId,
      departmentId: legacyOperationsCenterDepartmentId(input.facilityId),
      now: input.now,
      facilityTimezone: input.facilityTimezone,
      unitHeuristicHints,
    });
  }

  const departmentId = await resolveOperationsCenterDepartmentId(prisma, input.facilityId);

  return resolveActiveOperation(
    {
      facilityId: input.facilityId,
      departmentId,
      now: input.now,
      facilityTimezone: input.facilityTimezone,
      unitHeuristicHints,
    },
    deps,
  );
}
