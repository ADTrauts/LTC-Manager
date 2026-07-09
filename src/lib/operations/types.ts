/**
 * Wave 5 Operations Engine — schema-facing types and constants.
 * Runtime resolution (OPER-003+) lives here when wired behind `isOperationEngineEnabled()`.
 */

import type { MealType, OperationInstanceStatus } from "@prisma/client";

import type { OperationContext } from "@/lib/operations-center";

/** Active lifecycle states used when selecting the current operation for a department/day. */
export const ACTIVE_OPERATION_INSTANCE_STATUSES: OperationInstanceStatus[] = [
  "SCHEDULED",
  "PREPARATION",
  "EXECUTION",
];

/** Terminal states — instances no longer drive operational context. */
export const TERMINAL_OPERATION_INSTANCE_STATUSES: OperationInstanceStatus[] = ["COMPLETED", "CANCELLED"];

export type ActiveOperationSource = "heuristic" | "operation_instance";

export type ActiveOperationInstanceRow = {
  id: string;
  definitionId: string;
  facilityId: string;
  departmentId: string;
  serviceDate: Date;
  mealType: MealType | null;
  label: string;
  status: OperationInstanceStatus;
  scheduledStartLocal: string | null;
  scheduledEndLocal: string | null;
};

export type ResolveActiveOperationHeuristicHints = {
  unitCards: import("@/lib/operations-center").OperationsCenterUnitCard[];
  mealBoards: import("@/lib/operations-center").OperationsCenterMealBoard[];
};

export type ResolveActiveOperationUnitHeuristicHints = {
  unit: import("@/lib/unit-workspace/types").UnitWorkspaceUnit;
  mealServiceEventByMeal: Map<
    MealType,
    import("@/lib/unit-workspace/types").UnitWorkspaceMealServiceEventToday
  >;
};

export type ResolveActiveOperationInput = {
  facilityId: string;
  departmentId: string;
  now?: Date;
  heuristicHints?: ResolveActiveOperationHeuristicHints;
  unitHeuristicHints?: ResolveActiveOperationUnitHeuristicHints;
};

export type ResolvedActiveOperation = {
  source: ActiveOperationSource;
  facilityId: string;
  departmentId: string;
  serviceDate: Date;
  operationInstanceId: string | null;
  operationDefinitionId: string | null;
  instanceStatus: OperationInstanceStatus | null;
  label: string;
  operationContext: OperationContext;
};

export type OperationDefinitionKeyParts = {
  departmentKey: string;
  operationKey: string;
};

export type OperationInstanceLookup = {
  facilityId: string;
  departmentId: string;
  serviceDate: Date;
  mealType?: MealType | null;
};

export function isActiveOperationInstanceStatus(status: OperationInstanceStatus): boolean {
  return ACTIVE_OPERATION_INSTANCE_STATUSES.includes(status);
}
