/**
 * Assigned-SPACE operation aggregation. Same truthful rules as Neighborhood/landing.
 * Does not resolve cycles.
 */

import type { RuntimeLocationState } from "@/lib/runtime-location-state";

import {
  EMPLOYEE_NO_ACTIVE_OPERATION_LABEL,
  type EmployeeRuntimeOperation,
} from "./types";

export function uniqueActiveOperationKeys(
  states: readonly RuntimeLocationState[],
): string[] {
  return [
    ...new Set(
      states
        .filter((state) => state.operation.state === "ACTIVE")
        .map((state) => state.operation.current?.cycleStableKey)
        .filter((key): key is string => Boolean(key)),
    ),
  ];
}

export function uniqueActiveOperationLabels(
  states: readonly RuntimeLocationState[],
): string[] {
  return [
    ...new Set(
      states
        .filter((state) => state.operation.state === "ACTIVE")
        .map((state) => state.operation.current?.hierarchyLabel ?? state.operation.current?.label)
        .filter((label): label is string => Boolean(label)),
    ),
  ];
}

export function aggregateAssignedOperation(
  states: readonly RuntimeLocationState[],
): EmployeeRuntimeOperation {
  const keys = uniqueActiveOperationKeys(states);
  const labels = uniqueActiveOperationLabels(states);
  if (keys.length === 1) {
    return {
      kind: "shared",
      cycleStableKey: keys[0]!,
      label: labels[0] ?? keys[0]!,
    };
  }
  if (keys.length > 1 || labels.length > 1) {
    return {
      kind: "mixed",
      count: Math.max(keys.length, labels.length),
      labels,
    };
  }
  return { kind: "none" };
}

export function operationSummaryLabel(operation: EmployeeRuntimeOperation): string {
  if (operation.kind === "shared") return operation.label;
  if (operation.kind === "mixed") return `${operation.count} active operations`;
  return EMPLOYEE_NO_ACTIVE_OPERATION_LABEL;
}
