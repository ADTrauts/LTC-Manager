import type { OperationInstanceStatus } from "@prisma/client";

import { ACTIVE_OPERATION_INSTANCE_STATUSES, type ActiveOperationInstanceRow } from "./types";

const STATUS_PRIORITY: Record<OperationInstanceStatus, number> = {
  EXECUTION: 0,
  PREPARATION: 1,
  SCHEDULED: 2,
  COMPLETED: 100,
  CANCELLED: 101,
};

export function pickActiveOperationInstance(
  instances: ActiveOperationInstanceRow[],
  preferredMealType: import("@prisma/client").MealType,
): ActiveOperationInstanceRow | null {
  const active = instances.filter((instance) => ACTIVE_OPERATION_INSTANCE_STATUSES.includes(instance.status));
  if (active.length === 0) {
    return null;
  }

  return [...active].sort((left, right) => {
    const leftMealRank = left.mealType === preferredMealType ? 0 : left.mealType ? 1 : 2;
    const rightMealRank = right.mealType === preferredMealType ? 0 : right.mealType ? 1 : 2;
    if (leftMealRank !== rightMealRank) {
      return leftMealRank - rightMealRank;
    }

    const statusDiff = STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status];
    if (statusDiff !== 0) {
      return statusDiff;
    }

    return (left.scheduledStartLocal ?? "99:99").localeCompare(right.scheduledStartLocal ?? "99:99");
  })[0]!;
}
