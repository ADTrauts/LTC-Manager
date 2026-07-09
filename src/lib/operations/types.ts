/**
 * Wave 5 Operations Engine — schema-facing types and constants.
 * Runtime resolution (OPER-003+) lives here when wired behind `isOperationEngineEnabled()`.
 */

import type { MealType, OperationInstanceStatus } from "@prisma/client";

/** Active lifecycle states used when selecting the current operation for a department/day. */
export const ACTIVE_OPERATION_INSTANCE_STATUSES: OperationInstanceStatus[] = [
  "SCHEDULED",
  "PREPARATION",
  "EXECUTION",
];

/** Terminal states — instances no longer drive operational context. */
export const TERMINAL_OPERATION_INSTANCE_STATUSES: OperationInstanceStatus[] = ["COMPLETED", "CANCELLED"];

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
