import type { MealType, OperationInstanceStatus } from "@prisma/client";

import { fmtMealLabel } from "@/lib/operations-center/fmt-meal-label";
import type { OperationContext } from "@/lib/operations-center";
import { getDefaultMealTypeForTimeOfDay } from "@/lib/servery-meal-service";

import type { ActiveOperationInstanceRow, ResolvedActiveOperation } from "./types";

function parseScheduledTimeOnDate(timeStr: string, reference: Date): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const scheduled = new Date(reference);
  scheduled.setHours(hours, minutes, 0, 0);
  return scheduled;
}

export function phaseFromOperationInstanceStatus(status: OperationInstanceStatus): OperationContext["phase"] {
  return status === "EXECUTION" ? "Execution" : "Preparation";
}

export function resolveScheduledTimeLabel(scheduledStartLocal: string | null, now: Date): string | null {
  if (!scheduledStartLocal) {
    return null;
  }
  const parsed = parseScheduledTimeOnDate(scheduledStartLocal, now);
  if (!parsed) {
    return scheduledStartLocal;
  }
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function resolveMinutesUntilScheduledStart(scheduledStartLocal: string | null, now: Date): number | null {
  if (!scheduledStartLocal) {
    return null;
  }
  const parsed = parseScheduledTimeOnDate(scheduledStartLocal, now);
  if (!parsed) {
    return null;
  }
  return Math.round((parsed.getTime() - now.getTime()) / 60_000);
}

function resolveMealType(instance: ActiveOperationInstanceRow, now: Date): MealType {
  return instance.mealType ?? getDefaultMealTypeForTimeOfDay(now);
}

export function mapOperationInstanceToActiveOperation(
  instance: ActiveOperationInstanceRow,
  now: Date,
): ResolvedActiveOperation {
  const mealType = resolveMealType(instance, now);
  const mealLabel = instance.mealType ? fmtMealLabel(instance.mealType) : instance.label;
  const serviceLabel = instance.mealType ? `${mealLabel} service` : instance.label;

  return {
    source: "operation_instance",
    facilityId: instance.facilityId,
    departmentId: instance.departmentId,
    serviceDate: instance.serviceDate,
    operationInstanceId: instance.id,
    operationDefinitionId: instance.definitionId,
    instanceStatus: instance.status,
    label: instance.label,
    operationContext: {
      mealType,
      mealLabel,
      serviceLabel,
      phase: phaseFromOperationInstanceStatus(instance.status),
      scheduledTimeLabel: resolveScheduledTimeLabel(instance.scheduledStartLocal, now),
      minutesUntilService: resolveMinutesUntilScheduledStart(instance.scheduledStartLocal, now),
    },
  };
}
