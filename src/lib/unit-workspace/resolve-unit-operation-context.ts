import type { MealType } from "@prisma/client";

import { fmtMealLabel, type OperationContext } from "@/lib/operations-center";
import { parseFacilityLocalScheduledStart, resolveFacilityTimezone } from "@/lib/operational-time";
import {
  getDefaultMealTypeForTimeOfDay,
  isWithinServeryLiveWindow,
  pickDefaultMealTypeForUnitSlots,
} from "@/lib/servery-meal-service";

import type { UnitWorkspaceMealServiceEventToday, UnitWorkspaceUnit } from "./types";

function resolveScheduledTimeLabel(
  mealTimes: UnitWorkspaceUnit["mealTimes"],
  mealType: MealType,
  now: Date,
  facilityTimezone: string,
): string | null {
  const slot = mealTimes.find((time) => time.mealType === mealType);
  if (!slot) return null;
  const parsed = parseFacilityLocalScheduledStart(slot.scheduledTime, now, facilityTimezone);
  if (!parsed) return null;
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: facilityTimezone });
}

function resolveMinutesUntilService(
  mealTimes: UnitWorkspaceUnit["mealTimes"],
  mealType: MealType,
  now: Date,
  facilityTimezone: string,
): number | null {
  const slot = mealTimes.find((time) => time.mealType === mealType);
  if (!slot) return null;
  const parsed = parseFacilityLocalScheduledStart(slot.scheduledTime, now, facilityTimezone);
  if (!parsed) return null;
  return Math.round((parsed.getTime() - now.getTime()) / 60_000);
}

function resolveActiveMealType(
  unit: UnitWorkspaceUnit,
  now: Date,
  facilityTimezone: string,
): MealType {
  const mealTypes = unit.mealTimes.map((slot) => slot.mealType);
  if (unit.unitType === "SERVERY" && mealTypes.length > 0) {
    return pickDefaultMealTypeForUnitSlots(mealTypes, now, facilityTimezone);
  }
  return getDefaultMealTypeForTimeOfDay(now, facilityTimezone);
}

function resolveOperationPhase(
  unit: UnitWorkspaceUnit,
  mealType: MealType,
  mealServiceEventByMeal: Map<MealType, UnitWorkspaceMealServiceEventToday>,
  now: Date,
): OperationContext["phase"] {
  if (unit.unitType !== "SERVERY") {
    return "Preparation";
  }
  const event = mealServiceEventByMeal.get(mealType);
  if (
    event &&
    (isWithinServeryLiveWindow(event.mealServiceReadyAt, now) ||
      isWithinServeryLiveWindow(event.mealServiceStartedAt, now))
  ) {
    return "Execution";
  }
  return "Preparation";
}

export function resolveUnitOperationContext(args: {
  unit: UnitWorkspaceUnit;
  mealServiceEventByMeal: Map<MealType, UnitWorkspaceMealServiceEventToday>;
  now: Date;
  facilityTimezone?: string | null;
}): OperationContext {
  const facilityTimezone = resolveFacilityTimezone(args.facilityTimezone);
  const mealType = resolveActiveMealType(args.unit, args.now, facilityTimezone);
  const mealLabel = fmtMealLabel(mealType);
  const phase = resolveOperationPhase(args.unit, mealType, args.mealServiceEventByMeal, args.now);

  return {
    mealType,
    mealLabel,
    serviceLabel: `${mealLabel} service`,
    phase,
    scheduledTimeLabel: resolveScheduledTimeLabel(
      args.unit.mealTimes,
      mealType,
      args.now,
      facilityTimezone,
    ),
    minutesUntilService: resolveMinutesUntilService(
      args.unit.mealTimes,
      mealType,
      args.now,
      facilityTimezone,
    ),
  };
}
