import type { MealType, OperationInstanceStatus } from "@prisma/client";

import { fmtMealLabel } from "@/lib/operations-center/fmt-meal-label";
import type { OperationContext } from "@/lib/operations-center";
import { parseFacilityLocalScheduledStart, resolveFacilityTimezone } from "@/lib/operational-time";
import { getDefaultMealTypeForTimeOfDay } from "@/lib/servery-meal-service";

import type { ActiveOperationInstanceRow, ResolvedActiveOperation } from "./types";

export function phaseFromOperationInstanceStatus(status: OperationInstanceStatus): OperationContext["phase"] {
  return status === "EXECUTION" ? "Execution" : "Preparation";
}

export function resolveScheduledTimeLabel(
  scheduledStartLocal: string | null,
  now: Date,
  facilityTimezone?: string | null,
): string | null {
  if (!scheduledStartLocal) {
    return null;
  }
  const timeZone = resolveFacilityTimezone(facilityTimezone);
  const parsed = parseFacilityLocalScheduledStart(scheduledStartLocal, now, timeZone);
  if (!parsed) {
    return scheduledStartLocal;
  }
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone });
}

export function resolveMinutesUntilScheduledStart(
  scheduledStartLocal: string | null,
  now: Date,
  facilityTimezone?: string | null,
): number | null {
  if (!scheduledStartLocal) {
    return null;
  }
  const timeZone = resolveFacilityTimezone(facilityTimezone);
  const parsed = parseFacilityLocalScheduledStart(scheduledStartLocal, now, timeZone);
  if (!parsed) {
    return null;
  }
  return Math.round((parsed.getTime() - now.getTime()) / 60_000);
}

function resolveMealType(
  instance: ActiveOperationInstanceRow,
  now: Date,
  facilityTimezone: string,
): MealType {
  return instance.mealType ?? getDefaultMealTypeForTimeOfDay(now, facilityTimezone);
}

export function mapOperationInstanceToActiveOperation(
  instance: ActiveOperationInstanceRow,
  now: Date,
  facilityTimezone?: string | null,
): ResolvedActiveOperation {
  const timeZone = resolveFacilityTimezone(facilityTimezone);
  const mealType = resolveMealType(instance, now, timeZone);
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
      scheduledTimeLabel: resolveScheduledTimeLabel(instance.scheduledStartLocal, now, timeZone),
      minutesUntilService: resolveMinutesUntilScheduledStart(instance.scheduledStartLocal, now, timeZone),
    },
  };
}
